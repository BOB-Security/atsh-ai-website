'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const { getPool } = require('./db');
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
    const token=crypto.randomBytes(32).toString('base64url');
    const expires=new Date(Date.now()+SESSION_MS);
    await getPool().query('INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[user.id,digest(token),expires]);
    await getPool().query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);
    setCookie(res,token,req.app.locals.config.production);
    res.json({ok:true,user:{id:user.id,email:user.email,name:user.full_name,roles:user.roles}});
  } catch(err){next(err);}
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
module.exports={passwordHash,verifyPassword,login,requireAuth,requirePermission,logout};
