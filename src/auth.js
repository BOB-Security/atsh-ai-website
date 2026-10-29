'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { getPool } = require('./db');
const { getCredential, verifySecondFactor, createSetup, confirmSetup, safeEqual } = require('./mfa');
const scrypt = promisify(crypto.scrypt);
const SESSION_HOURS = 8;
const PRIVILEGED_ROLES = new Set(['Owner','Administrator','Finance']);

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^[a-f0-9]{128}$/i.test(parts[2])) {
    await scrypt(password, Buffer.alloc(16), 64, { maxmem: 64 * 1024 * 1024 });
    return false;
  }
  const expected = Buffer.from(parts[2], 'hex');
  const derived = await scrypt(password, Buffer.from(parts[1], 'hex'), expected.length, { maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(derived, expected);
}
function normalizePermissions(roles) {
  if (roles.some(role => role.name === 'Owner')) return ['*'];
  const result = new Set();
  for (const role of roles) for (const permission of (Array.isArray(role.permissions) ? role.permissions : [])) if (typeof permission === 'string') result.add(permission);
  return [...result];
}
async function verifyCredentials(config, emailInput, password) {
  const email = String(emailInput || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 1 || password.length > 1024) {
    await scrypt(String(password || ''), Buffer.alloc(16), 64, { maxmem: 64 * 1024 * 1024 });
    return null;
  }
  const pool = getPool(config);
  const result = await pool.query("SELECT u.id,u.organization_id,u.email,u.full_name,u.password_hash,u.status,u.locale FROM users u JOIN organizations o ON o.id=u.organization_id WHERE lower(u.email)=$1 AND o.slug=$2 AND o.status='active' LIMIT 1", [email, config.organizationSlug]);
  const user = result.rows[0];
  if (!user || user.status !== 'active' || !await verifyPassword(password, user.password_hash)) return null;
  const roleResult = await pool.query("SELECT r.name,r.permissions FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND (r.organization_id IS NULL OR r.organization_id=$2) ORDER BY r.name", [user.id, user.organization_id]);
  if (!roleResult.rowCount) return null;
  return { user, roles: roleResult.rows };
}
async function createSession(config, user, roles, prefix = '', hours = SESSION_HOURS) {
  const token = prefix + crypto.randomBytes(32).toString('base64url');
  await getPool(config).query("INSERT INTO auth_sessions (user_id,token_hash,expires_at) VALUES ($1,$2,NOW()+($3 * INTERVAL '1 hour'))", [user.id, sha256(token), hours]);
  return { token, expiresInSeconds: hours * 3600, user: { id:user.id,email:user.email,name:user.full_name,locale:user.locale,roles:roles.map(role=>role.name),permissions:normalizePermissions(roles) } };
}
async function login(config, email, password, secondFactor) {
  const verified = await verifyCredentials(config, email, password);
  if (!verified) return null;
  const { user, roles } = verified;
  if (roles.some(role => PRIVILEGED_ROLES.has(role.name))) {
    let credential;
    try { credential = await getCredential(config, user.id); }
    catch (error) { if (error && error.code === '42P01') { error.code = 'MFA_MIGRATION_REQUIRED'; } throw error; }
    if (!credential || !credential.enabled) return { requiresMfaSetup: true, user: { email:user.email, name:user.full_name } };
    if (!secondFactor) return { requiresMfa: true, user: { email:user.email, name:user.full_name } };
    if (!await verifySecondFactor(config, user.id, secondFactor)) return null;
  }
  return createSession(config, user, roles);
}
async function beginMfaSetup(config, email, password, bootstrapToken, env = process.env) {
  const expected = env.ADMIN_MFA_BOOTSTRAP_TOKEN || '';
  if (!expected || !safeEqual(bootstrapToken, expected)) { const error = new Error('MFA bootstrap is not authorized'); error.code = 'MFA_BOOTSTRAP_DENIED'; throw error; }
  const verified = await verifyCredentials(config, email, password);
  if (!verified || !verified.roles.some(role => role.name === 'Owner')) return null;
  const existing = await getCredential(config, verified.user.id);
  if (existing && existing.enabled) { const error = new Error('MFA is already enabled'); error.code = 'MFA_ALREADY_ENABLED'; throw error; }
  const setup = await createSetup(config, verified.user.id, env);
  const session = await createSession(config, verified.user, verified.roles, 'setup.', 10 / 60);
  return { ...session, secret: setup.secret, otpauthUrl: setup.otpauthUrl };
}
async function completeMfaSetup(config, userId, code, setupToken, env = process.env) {
  if (!setupToken || !setupToken.startsWith('setup.')) return null;
  const codes = await confirmSetup(config, userId, code, env);
  if (!codes) return null;
  const pool = getPool(config);
  await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [sha256(setupToken)]);
  const verified = await pool.query("SELECT u.id,u.organization_id,u.email,u.full_name,u.locale FROM users u WHERE u.id=$1 AND u.status='active'", [userId]);
  if (!verified.rowCount) return null;
  const roleResult = await pool.query("SELECT r.name,r.permissions FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 ORDER BY r.name", [userId]);
  const session = await createSession(config, verified.rows[0], roleResult.rows);
  return { ...session, recoveryCodes: codes };
}
async function getSession(config, token) {
  if (!token || typeof token !== 'string' || token.length > 220) return null;
  const pool = getPool(config);
  const result = await pool.query("SELECT u.id,u.organization_id,u.email,u.full_name,u.locale FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=u.organization_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active' AND o.slug=$2 AND o.status='active' LIMIT 1", [sha256(token), config.organizationSlug]);
  if (!result.rowCount) return null;
  const user = result.rows[0];
  const roleResult = await pool.query("SELECT r.name,r.permissions FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND (r.organization_id IS NULL OR r.organization_id=$2) ORDER BY r.name", [user.id,user.organization_id]);
  if (!roleResult.rowCount) return null;
  await pool.query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE token_hash=$1 AND last_seen_at<NOW()-INTERVAL '5 minutes'", [sha256(token)]);
  return { id:user.id,email:user.email,name:user.full_name,locale:user.locale,roles:roleResult.rows.map(role=>role.name),permissions:normalizePermissions(roleResult.rows) };
}
async function logout(config, token) { if (token && typeof token === 'string' && token.length <= 220) await getPool(config).query('DELETE FROM auth_sessions WHERE token_hash=$1',[sha256(token)]); }
function cookieHeader(token, production, maxAge = SESSION_HOURS * 3600) { return 'atsh_session='+token+'; Path=/; Max-Age='+maxAge+'; HttpOnly; SameSite=Strict'+(production?'; Secure':''); }
function clearCookieHeader(production) { return 'atsh_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict'+(production?'; Secure':''); }
function readCookie(req,name='atsh_session') { const header=req.headers.cookie||'';for(const pair of header.split(';')){const index=pair.indexOf('=');if(index>-1&&pair.slice(0,index).trim()===name)return decodeURIComponent(pair.slice(index+1).trim());}return null; }
function hasPermission(session, permission) { return Boolean(session&&(session.permissions.includes('*')||session.permissions.includes(permission))); }
module.exports = { login, verifyCredentials, beginMfaSetup, completeMfaSetup, getSession, logout, cookieHeader, clearCookieHeader, readCookie, hasPermission, verifyPassword };
