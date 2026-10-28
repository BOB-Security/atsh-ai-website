'use strict';
const crypto=require('node:crypto');
const {getPool}=require('./db');
const COOKIE='atsh_platform_mfa_challenge';
function key(){const raw=process.env.MFA_ENCRYPTION_KEY||'';if(!/^[a-f0-9]{64}$/i.test(raw))throw new Error('MFA_ENCRYPTION_KEY must be a 32-byte hexadecimal key.');return Buffer.from(raw,'hex');}
function encryptSecret(secret){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),body=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');}
function decryptSecret(value){const [iv,tag,body]=String(value||'').split('.');if(!iv||!tag||!body)throw new Error('Invalid encrypted MFA secret.');const d=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));d.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([d.update(Buffer.from(body,'base64url')),d.final()]).toString('utf8');}
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf){let bits=0,value=0,out='';for(const byte of buf){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=B32[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=B32[(value<<(5-bits))&31];return out;}
function base32Decode(s){let bits=0,value=0,out=[];for(const ch of String(s).replace(/=+$/,'').toUpperCase()){const n=B32.indexOf(ch);if(n<0)throw new Error('Invalid base32 secret.');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
function generateSecret(){return base32Encode(crypto.randomBytes(20));}
function totpAt(secret,step){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(step));const mac=crypto.createHmac('sha1',base32Decode(secret)).update(b).digest(),off=mac[mac.length-1]&15,n=(mac.readUInt32BE(off)&0x7fffffff)%1000000;return String(n).padStart(6,'0');}
function verifyTotp(secret,code,now=Date.now(),lastStep=-1){if(!/^\d{6}$/.test(String(code||'')))return null;const step=Math.floor(now/30000);for(const candidate of [step-1,step,step+1]){if(candidate<=lastStep)continue;const expected=totpAt(secret,candidate);if(crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(String(code))))return candidate;}return null;}
function recoveryCodes(){return Array.from({length:10},()=>crypto.randomBytes(8).toString('hex').toUpperCase());}
function hashRecovery(code){return crypto.createHash('sha256').update(String(code||'').replace(/[^a-f0-9]/gi,'').toUpperCase()).digest('hex');}
function setChallengeCookie(res,token,production){res.cookie(COOKIE,token,{httpOnly:true,secure:production,sameSite:'strict',path:'/api/admin/auth/mfa',maxAge:300000});}
async function beginLoginChallenge(userId,req,res){const token=crypto.randomBytes(32).toString('base64url');await getPool().query('DELETE FROM auth_mfa_challenges WHERE expires_at<=now() OR attempts>=5');await getPool().query('INSERT INTO auth_mfa_challenges(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[userId,crypto.createHash('sha256').update(token).digest('hex'),new Date(Date.now()+300000)]);setChallengeCookie(res,token,req.app.locals.config.production);}
async function completeLogin(req,res){
  const token=req.cookies?.[COOKIE];
  if(!token)return {status:401,body:{error:'جلسة التحقق الثنائي غير موجودة أو انتهت.'}};
  const db=getPool(),hash=crypto.createHash('sha256').update(token).digest('hex'),client=await db.connect();
  let session=null,userId=null;
  try{
    await client.query('BEGIN');
    const q=await client.query(
      'SELECT c.user_id,c.attempts,m.secret_ciphertext,m.last_totp_step FROM auth_mfa_challenges c JOIN user_mfa m ON m.user_id=c.user_id WHERE c.token_hash=$1 AND c.expires_at>now() AND c.attempts<5 AND m.enabled=true FOR UPDATE OF c,m',
      [hash]
    );
    if(!q.rows[0]){
      await client.query('ROLLBACK');
      return {status:401,body:{error:'جلسة التحقق الثنائي غير صالحة أو انتهت.'}};
    }
    const u=q.rows[0],raw=String(req.body.code||'').trim();
    const secret=decryptSecret(u.secret_ciphertext);
    const step=verifyTotp(secret,raw,Date.now(),Number(u.last_totp_step));
    await client.query('UPDATE auth_mfa_challenges SET attempts=attempts+1 WHERE token_hash=$1',[hash]);
    let accepted=false;
    if(step!==null){
      const used=await client.query('UPDATE user_mfa SET last_totp_step=$2,updated_at=now() WHERE user_id=$1 AND last_totp_step<$2 AND enabled=true',[u.user_id,step]);
      accepted=used.rowCount===1;
    }else if(/^[a-f0-9]{16}$/i.test(raw)){
      const codeHash=hashRecovery(raw);
      const used=await client.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1 AND code_hash=$2 RETURNING id',[u.user_id,codeHash]);
      accepted=used.rowCount===1;
    }
    if(!accepted){
      await client.query('COMMIT');
      return {status:401,body:{error:'رمز التحقق غير صحيح أو سبق استخدامه.'}};
    }
    session=crypto.randomBytes(32).toString('base64url');userId=u.user_id;
    await client.query('INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[userId,crypto.createHash('sha256').update(session).digest('hex'),new Date(Date.now()+8*60*60*1000)]);
    await client.query('DELETE FROM auth_mfa_challenges WHERE token_hash=$1',[hash]);
    await client.query("INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) SELECT organization_id,$1,'auth.mfa_login','user',$2,'{}'::jsonb FROM users WHERE id=$3",[userId,String(userId),userId]);
    await client.query('COMMIT');
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    throw e;
  }finally{client.release();}
  res.cookie('atsh_platform_session',session,{httpOnly:true,secure:req.app.locals.config.production,sameSite:'strict',path:'/',maxAge:8*60*60*1000});
  res.clearCookie(COOKIE,{httpOnly:true,secure:req.app.locals.config.production,sameSite:'strict',path:'/api/admin/auth/mfa'});
  const usr=await db.query("SELECT u.id,u.email,u.full_name,COALESCE(jsonb_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL),'[]'::jsonb) roles,COALESCE(jsonb_agg(DISTINCT r.permissions) FILTER (WHERE r.name IS NOT NULL),'[]'::jsonb) permission_sets FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 GROUP BY u.id",[userId]);
  const row=usr.rows[0];
  return {status:200,body:{ok:true,user:{id:row.id,email:row.email,name:row.full_name,roles:row.roles,permissions:row.permission_sets.flat()}}};
}
module.exports={encryptSecret,decryptSecret,generateSecret,verifyTotp,recoveryCodes,hashRecovery,beginLoginChallenge,completeLogin,COOKIE};
