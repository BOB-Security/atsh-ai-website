'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { getPool } = require('./db');
const scrypt = promisify(crypto.scrypt);
const SESSION_HOURS = 8;

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^[a-f0-9]{128}$/i.test(parts[2])) {
    await scrypt(password, Buffer.alloc(16), 64, { maxmem: 64 * 1024 * 1024 });
    return false;
  }
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = await scrypt(password, salt, expected.length, { maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(derived, expected);
}
function normalizePermissions(roles) {
  if (roles.some(role => role.name === 'Owner')) return ['*'];
  const result = new Set();
  for (const role of roles) {
    const values = Array.isArray(role.permissions) ? role.permissions : [];
    for (const permission of values) if (typeof permission === 'string') result.add(permission);
  }
  return [...result];
}
async function login(config, emailInput, password) {
  const email = String(emailInput || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 1 || password.length > 1024) {
    await scrypt(String(password || ''), Buffer.alloc(16), 64, { maxmem: 64 * 1024 * 1024 });
    return null;
  }
  const pool = getPool(config);
  const result = await pool.query(
    "SELECT u.id, u.organization_id, u.email, u.full_name, u.password_hash, u.status, u.locale FROM users u JOIN organizations o ON o.id=u.organization_id WHERE lower(u.email)=$1 AND o.slug=$2 AND o.status='active' LIMIT 1",
    [email, config.organizationSlug]
  );
  const user = result.rows[0];
  if (!user || user.status !== 'active' || !await verifyPassword(password, user.password_hash)) return null;
  const roleResult = await pool.query(
    "SELECT r.name, r.permissions FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND (r.organization_id IS NULL OR r.organization_id=$2) ORDER BY r.name",
    [user.id, user.organization_id]
  );
  const roles = roleResult.rows;
  if (!roles.length) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  await pool.query(
    "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1,$2,NOW() + ($3 * INTERVAL '1 hour'))",
    [user.id, tokenHash, SESSION_HOURS]
  );
  return {
    token,
    expiresInSeconds: SESSION_HOURS * 3600,
    user: { id: user.id, email: user.email, name: user.full_name, locale: user.locale, roles: roles.map(role => role.name), permissions: normalizePermissions(roles) }
  };
}
async function getSession(config, token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const pool = getPool(config);
  const result = await pool.query(
    "SELECT u.id, u.organization_id, u.email, u.full_name, u.locale FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=u.organization_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active' AND o.slug=$2 AND o.status='active' LIMIT 1",
    [sha256(token), config.organizationSlug]
  );
  if (!result.rowCount) return null;
  const user = result.rows[0];
  const roleResult = await pool.query(
    "SELECT r.name, r.permissions FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND (r.organization_id IS NULL OR r.organization_id=$2) ORDER BY r.name",
    [user.id, user.organization_id]
  );
  if (!roleResult.rowCount) return null;
  await pool.query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE token_hash=$1 AND last_seen_at < NOW() - INTERVAL '5 minutes'", [sha256(token)]);
  return { id: user.id, email: user.email, name: user.full_name, locale: user.locale, roles: roleResult.rows.map(role => role.name), permissions: normalizePermissions(roleResult.rows) };
}
async function logout(config, token) {
  if (!token || typeof token !== 'string' || token.length > 200) return;
  await getPool(config).query('DELETE FROM auth_sessions WHERE token_hash=$1', [sha256(token)]);
}
function cookieHeader(token, production) {
  return 'atsh_session=' + token + '; Path=/; Max-Age=' + (SESSION_HOURS * 3600) + '; HttpOnly; SameSite=Strict' + (production ? '; Secure' : '');
}
function clearCookieHeader(production) {
  return 'atsh_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' + (production ? '; Secure' : '');
}
function readCookie(req, name = 'atsh_session') {
  const header = req.headers.cookie || '';
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index > -1 && pair.slice(0, index).trim() === name) return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return null;
}
function hasPermission(session, permission) {
  return Boolean(session && (session.permissions.includes('*') || session.permissions.includes(permission)));
}
module.exports = { login, getSession, logout, cookieHeader, clearCookieHeader, readCookie, hasPermission, verifyPassword };
