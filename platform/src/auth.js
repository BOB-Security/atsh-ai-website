'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const { getPool } = require('./db');
const COOKIE = 'atsh_platform_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const TOTP_STEP_SECONDS=30,TOTP_WINDOW=1,TOTP_DIGITS=6,RECOVERY_CODES=10;
function digest(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(key).toString('hex')}`;
}
async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [,salt,hex] = stored.split('$');
  const actual = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(hex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function base32Encode(buffer){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,out='';for(const b of buffer){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value >>> (bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
function base32Decode(input){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';const clean=String(input||'').toUpperCase().replace(/=+$/,'').replace(/[\s-]/g,'');let bits=0,value=0,out=[];for(const c of clean){const n=alphabet.indexOf(c);if(n<0)throw new Error('Invalid base32 secret');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value >>> (bits-8))&255);bits-=8;}}return Buffer.from(out);}
function totpAt(secret,seconds=Math.floor(Date.now()/1000)){const counter=BigInt(Math.floor(seconds/TOTP_STEP_SECONDS)),message=Buffer.alloc(8);message.writeBigUInt64BE(counter);const mac=crypto.createHmac('sha1',Buffer.isBuffer(secret)?secret:base32Decode(secret)).update(message).digest(),offset=mac[mac.length-1]&15;const n=((mac[offset]&127)<<24)|((mac[offset+1]&255)<<16)|((mac[offset+2]&255)<<8)|(mac[offset+3]&255);return String(n%(10**TOTP_DIGITS)).padStart(TOTP_DIGITS,'0');}
function verifyTotp(secret,token,seconds=Math.floor(Date.now()/1000),window=TOTP_WINDOW){const candidate=String(token||'').replace(/\s/g,'');if(!/^[0-9]{6}$/.test(candidate))return null;const current=Math.floor(seconds/TOTP_STEP_SECONDS);for(let delta=-window;delta<=window;delta++){const counter=current+delta;if(counter<0)continue;const expected=totpAt(secret,counter*TOTP_STEP_SECONDS);if(crypto.timingSafeEqual(Buffer.from(candidate),Buffer.from(expected)))return counter;}return null;}
function encryptSecret(secret,keyMaterial){if(!/^[0-9a-fA-F]{64}$/.test(keyMaterial||''))throw new Error('MFA_ENCRYPTION_KEY must be 32-byte hex.');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(keyMaterial,'hex'),iv),data=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');}
function decryptSecret(value,keyMaterial){if(!/^[0-9a-fA-F]{64}$/.test(keyMaterial||''))throw new Error('MFA_ENCRYPTION_KEY must be 32-byte hex.');const [iv,tag,data]=String(value||'').split('.');if(!iv||!tag||!data)throw new Error('Invalid encrypted MFA secret.');const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(keyMaterial,'hex'),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');}
function generateRecoveryCodes(count=RECOVERY_CODES){return Array.from({length:count},()=>crypto.randomBytes(5).toString('hex').toUpperCase());}
function hashRecoveryCode(code){return crypto.createHash('sha256').update(String(code||'').replace(/[\s-]/g,'').toUpperCase()).digest('hex');}
function privilegedUser(user){const roles=Array.isArray(user?.roles)?user.roles:[],permissions=Array.isArray(user?.permissions)?user.permissions:(Array.isArray(user?.permission_sets)?user.permission_sets.flat():[]);return roles.some(r=>['Owner','Administrator','Admin','System Administrator'].includes(r))||permissions.some(p=>['*','security.manage','team.manage','team.invite','team.roles','settings.manage','integrations.manage','backups.restore','quotes.approve','catalog.manage'].includes(p));}
function setCookie(res, token, production) {
  res.cookie(COOKIE, token, { httpOnly:true, secure:production, sameSite:'strict', path:'/', maxAge:SESSION_MS });
}
async function login(req,res,next) {
  try {
    const email=String(req.body.email||'').trim().toLowerCase();
    const password=String(req.body.password||'');
    if(!email||password.length<1||password.length>256)return res.status(400).json({error:'بيانات الدخول غير صحيحة.'});
    const org=req.app.locals.organizationId;
    const {rows}=await getPool().query(
      `SELECT u.id,u.email,u.full_name,u.password_hash,u.status,u.mfa_enabled,u.mfa_secret_enc,u.mfa_last_counter,
        COALESCE(jsonb_agg(DISTINCT r.name) FILTER(WHERE r.name IS NOT NULL),'[]'::jsonb) AS roles,
        COALESCE(jsonb_agg(DISTINCT r.permissions) FILTER(WHERE r.name IS NOT NULL),'[]'::jsonb) AS permission_sets
       FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
       WHERE u.organization_id=$1 AND lower(u.email)=lower($2) GROUP BY u.id LIMIT 1`,[org,email]);
    const user=rows[0];
    if(!user||user.status!=='active'||!await verifyPassword(password,user.password_hash))return res.status(401).json({error:'البريد الإلكتروني أو كلمة المرور غير صحيحة.'});
    const isPrivileged=privilegedUser({...user,permissions:user.permission_sets.flat()});
    if(isPrivileged&&!user.mfa_enabled){
      // Do not issue privileged sessions while MFA has not been enrolled.
      const token=crypto.randomBytes(32).toString('base64url');
      const expires=new Date(Date.now()+SESSION_MS);
      await getPool().query('INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at,mfa_enrollment_required) VALUES($1,$2,$3,NULL,true)',[user.id,digest(token),expires]);
      setCookie(res,token,req.app.locals.config.production);
      return res.json({ok:true,requiresMfaEnrollment:true,user:{id:user.id,email:user.email,name:user.full_name,roles:user.roles,permissions:user.permission_sets.flat()}});
    }
    if(user.mfa_enabled){
      const mfaCode=String(req.body.mfaCode||''),recoveryCode=String(req.body.recoveryCode||'');
      if(!mfaCode&&!recoveryCode)return res.status(200).json({ok:false,requiresMfa:true,message:'أدخل رمز المصادقة الثنائية.'});
      if(mfaCode){
        let secret;
        try{secret=decryptSecret(user.mfa_secret_enc,req.app.locals.config.mfaEncryptionKey);}
        catch{return res.status(503).json({error:'المصادقة الثنائية غير متاحة بسبب إعداد أمني.'});}
        const counter=verifyTotp(secret,mfaCode);
        if(counter===null)return res.status(401).json({error:'رمز المصادقة غير صحيح أو انتهت صلاحيته.'});
        const client=await getPool().connect();
        try{
          await client.query('BEGIN');
          const changed=await client.query('UPDATE users SET mfa_last_counter=$2 WHERE id=$1 AND COALESCE(mfa_last_counter,-1)<$2 RETURNING id',[user.id,counter]);
          if(!changed.rowCount){await client.query('ROLLBACK');return res.status(401).json({error:'تم استخدام هذا الرمز من قبل. انتظر الرمز التالي.'});}
          await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
        finally{client.release();}
      }else{
        const used=await getPool().query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1 AND code_hash=$2 RETURNING id',[user.id,hashRecoveryCode(recoveryCode)]);
        if(!used.rowCount)return res.status(401).json({error:'رمز الاسترداد غير صالح أو سبق استخدامه.'});
        await getPool().query("INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'auth.mfa.recovery_login','user',$2,'{}'::jsonb)",[org,user.id]);
      }
    }
    const token=crypto.randomBytes(32).toString('base64url'),expires=new Date(Date.now()+SESSION_MS);
    await getPool().query('INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES($1,$2,$3,$4)',[user.id,digest(token),expires,user.mfa_enabled?new Date():null]);
    await getPool().query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);
    setCookie(res,token,req.app.locals.config.production);
    res.json({ok:true,user:{id:user.id,email:user.email,name:user.full_name,roles:user.roles,permissions:user.permission_sets.flat()}});
  }catch(err){next(err);}
}

async function requireAuth(req,res,next) {
  try {
    const token=req.cookies?.[COOKIE];
    if(!token) return res.status(401).json({error:'يلزم تسجيل الدخول.'});
    const {rows}=await getPool().query(
      `SELECT u.id,u.organization_id,u.email,u.full_name,u.status,u.mfa_enabled,s.mfa_verified_at,s.mfa_enrollment_required,
       COALESCE(jsonb_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL),'[]'::jsonb) roles,
       COALESCE(jsonb_agg(DISTINCT r.permissions) FILTER (WHERE r.name IS NOT NULL),'[]'::jsonb) permission_sets
       FROM auth_sessions s JOIN users u ON u.id=s.user_id
       LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
       WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'
       GROUP BY u.id,s.mfa_verified_at,s.mfa_enrollment_required LIMIT 1`,[digest(token)]);
    const user=rows[0];
    if(!user) {res.clearCookie(COOKIE,{path:'/'});return res.status(401).json({error:'انتهت الجلسة. سجل الدخول مجددًا.'});}
    if(user.organization_id!==req.app.locals.organizationId) return res.status(403).json({error:'لا توجد صلاحية للوصول.'});
    const privileged=privilegedUser({...user,permissions:user.permission_sets.flat()});
    if(privileged && !user.mfa_enabled && !user.mfa_enrollment_required) return res.status(403).json({error:'يجب تفعيل المصادقة الثنائية قبل استخدام الحساب الإداري.'});
    if(privileged && !user.mfa_enabled && user.mfa_enrollment_required && !req.path.startsWith('/auth/mfa/')) return res.status(403).json({error:'هذه الجلسة محدودة بإعداد المصادقة الثنائية. أكمل الإعداد أولًا.'});
    if(privileged && user.mfa_enabled && !user.mfa_verified_at) return res.status(401).json({error:'يلزم إكمال المصادقة الثنائية.'});
    req.user=user;
    req.permissionSets=user.permission_sets.flat();
    req.mfaEnrollmentOnly=Boolean(user.mfa_enrollment_required);
    await getPool().query('UPDATE auth_sessions SET last_seen_at=now() WHERE token_hash=$1',[digest(token)]);
    next();
  } catch(err){next(err);}
}

function requirePermission(permission) {
  return (req,res,next)=>{
    const sets=req.permissionSets||[];
    const allowed=(req.user?.roles||[]).includes('Owner') || sets.some(s=>Array.isArray(s)&&(s.includes('*')||s.includes(permission)));
    if(!allowed) return res.status(403).json({error:'ليست لديك صلاحية لتنفيذ هذا الإجراء.'});
    next();
  };
}
async function logout(req,res,next) {
  try {
    const token=req.cookies?.[COOKIE];
    if(token) await getPool().query('DELETE FROM auth_sessions WHERE token_hash=$1',[digest(token)]);
    res.clearCookie(COOKIE,{path:'/',sameSite:'strict',secure:req.app.locals.config.production,httpOnly:true});
    res.json({ok:true});
  } catch(err){next(err);}
}
module.exports={passwordHash,verifyPassword,login,requireAuth,requirePermission,logout,digest,base32Encode,base32Decode,totpAt,verifyTotp,encryptSecret,decryptSecret,generateRecoveryCodes,hashRecoveryCode,privilegedUser};
