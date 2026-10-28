'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const { getPool } = require('./db');
const mfa = require('./mfa');
const COOKIE = 'atsh_platform_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
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
function setCookie(res, token, production) {
  res.cookie(COOKIE, token, { httpOnly:true, secure:production, sameSite:'strict', path:'/', maxAge:SESSION_MS });
}
async function login(req,res,next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || password.length < 1 || password.length > 256) return res.status(400).json({error:'بيانات الدخول غير صحيحة.'});
    const org = req.app.locals.organizationId;
    const { rows } = await getPool().query(
      `SELECT u.id,u.email,u.full_name,u.password_hash,u.status,
        COALESCE(jsonb_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL),'[]'::jsonb) AS roles,
        COALESCE(jsonb_agg(DISTINCT r.permissions) FILTER (WHERE r.name IS NOT NULL),'[]'::jsonb) AS permission_sets
       FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
       WHERE u.organization_id=$1 AND lower(u.email)=lower($2) GROUP BY u.id LIMIT 1`,[org,email]);
    const user=rows[0];
    if (!user || user.status!=='active' || !await verifyPassword(password,user.password_hash)) return res.status(401).json({error:'البريد الإلكتروني أو كلمة المرور غير صحيحة.'});
    const mfaState = await getPool().query('SELECT enabled FROM user_mfa WHERE user_id=$1', [user.id]);
    if (mfaState.rows[0]?.enabled) {
      await mfa.beginLoginChallenge(user.id, res, req.app.locals.config.production);
      return res.json({ok:true,mfaRequired:true});
    }
    const token=crypto.randomBytes(32).toString('base64url');
    const expires=new Date(Date.now()+SESSION_MS);
    await getPool().query('INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[user.id,digest(token),expires]);
    await getPool().query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);
    setCookie(res,token,req.app.locals.config.production);
    res.json({ok:true,user:{id:user.id,email:user.email,name:user.full_name,roles:user.roles,permissions:user.permission_sets.flat()}});
  } catch(err){next(err);}
}
async function verifyMfaLogin(req,res,next) {
  try {
    const challenge = req.cookies?.['atsh_platform_mfa_challenge'];
    if (!challenge) return res.status(401).json({error:'جلسة التحقق الثنائي غير موجودة أو انتهت.'});
    const tokenHash = digest(challenge);
    const db = getPool();
    const found = await db.query(
      'SELECT c.user_id,c.attempts,m.secret_ciphertext,m.last_totp_step FROM auth_mfa_challenges c JOIN user_mfa m ON m.user_id=c.user_id WHERE c.token_hash=$1 AND c.expires_at>now() AND c.attempts<5 AND m.enabled=true',
      [tokenHash]
    );
    if (!found.rows[0]) return res.status(401).json({error:'جلسة التحقق الثنائي غير صالحة أو انتهت.'});
    const record = found.rows[0];
    await db.query('UPDATE auth_mfa_challenges SET attempts=attempts+1 WHERE token_hash=$1 AND attempts<5',[tokenHash]);
    const raw = String(req.body.code || '').trim();
    let accepted = false;
    let step = null;
    const secret = mfa.decryptSecret(record.secret_ciphertext);
    step = mfa.verifyTotp(secret, raw, Date.now(), Number(record.last_totp_step));
    if (step !== null) {
      const updated = await db.query('UPDATE user_mfa SET last_totp_step=$2,updated_at=now() WHERE user_id=$1 AND last_totp_step<$2 AND enabled=true',[record.user_id,step]);
      accepted = updated.rowCount === 1;
    } else if (/^[a-f0-9]{16}$/i.test(raw)) {
      const removed = await db.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1 AND code_hash=$2 RETURNING id',[record.user_id,mfa.hashRecovery(raw)]);
      accepted = removed.rowCount === 1;
    }
    if (!accepted) return res.status(401).json({error:'رمز التحقق غير صحيح أو سبق استخدامه.'});
    const userResult = await db.query(
      `SELECT u.id,u.email,u.full_name,u.status,
       COALESCE(jsonb_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL),'[]'::jsonb) AS roles,
       COALESCE(jsonb_agg(DISTINCT r.permissions) FILTER (WHERE r.name IS NOT NULL),'[]'::jsonb) AS permission_sets
       FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
       WHERE u.id=$1 AND u.status='active' AND u.organization_id=$2 GROUP BY u.id LIMIT 1`,
      [record.user_id, req.app.locals.organizationId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({error:'تعذر التحقق من الحساب.'});
    const token = crypto.randomBytes(32).toString('base64url');
    await db.query('INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[user.id,digest(token),new Date(Date.now()+SESSION_MS)]);
    await db.query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);
    await db.query('DELETE FROM auth_mfa_challenges WHERE token_hash=$1',[tokenHash]);
    res.cookie(COOKIE,token,{httpOnly:true,secure:req.app.locals.config.production,sameSite:'strict',path:'/',maxAge:SESSION_MS});
    res.clearCookie('atsh_platform_mfa_challenge',{httpOnly:true,secure:req.app.locals.config.production,sameSite:'strict',path:'/api/admin/auth/mfa'});
    res.json({ok:true,user:{id:user.id,email:user.email,name:user.full_name,roles:user.roles,permissions:user.permission_sets.flat()}});
  } catch(err) { next(err); }
}
async function requireAuth(req,res,next) {
  try {
    const token=req.cookies?.[COOKIE];
    if(!token) return res.status(401).json({error:'يلزم تسجيل الدخول.'});
    const {rows}=await getPool().query(
      `SELECT u.id,u.organization_id,u.email,u.full_name,u.status,
       COALESCE(jsonb_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL),'[]'::jsonb) roles,
       COALESCE(jsonb_agg(DISTINCT r.permissions) FILTER (WHERE r.name IS NOT NULL),'[]'::jsonb) permission_sets
       FROM auth_sessions s JOIN users u ON u.id=s.user_id
       LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
       WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'
       GROUP BY u.id LIMIT 1`,[digest(token)]);
    if(!rows[0]) {res.clearCookie(COOKIE,{path:'/'});return res.status(401).json({error:'انتهت الجلسة. سجل الدخول مجددًا.'});}
    if(rows[0].organization_id!==req.app.locals.organizationId) return res.status(403).json({error:'لا توجد صلاحية للوصول.'});
    req.user=rows[0]; req.permissionSets=rows[0].permission_sets.flat();
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
module.exports={passwordHash,verifyPassword,login,verifyMfaLogin,requireAuth,requirePermission,logout};
