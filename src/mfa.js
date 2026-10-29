'use strict';
const crypto = require('node:crypto');
const { getPool } = require('./db');
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0, value = 0, output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(value) {
  const input = String(value).toUpperCase().replace(/=+$/,'').replace(/\s+/g,'');
  let bits = 0, buffer = 0; const output = [];
  for (const char of input) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    buffer = (buffer << 5) | index; bits += 5;
    if (bits >= 8) { output.push((buffer >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}
function generateSecret() { return base32Encode(crypto.randomBytes(20)); }
function totpCode(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000);
  const counterBuffer = Buffer.alloc(8); counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | ((digest[offset + 1] & 255) << 16) | ((digest[offset + 2] & 255) << 8) | (digest[offset + 3] & 255);
  return String(binary % 1000000).padStart(6, '0');
}
function verifyTotp(secret, token, timestamp = Date.now()) {
  if (!/^\d{6}$/.test(String(token || ''))) return false;
  for (const shift of [-30000, 0, 30000]) {
    const expected = totpCode(secret, timestamp + shift);
    const left = Buffer.from(expected); const right = Buffer.from(String(token));
    if (left.length === right.length && crypto.timingSafeEqual(left, right)) return true;
  }
  return false;
}
function encryptionKey(env = process.env) {
  const value = env.MFA_ENCRYPTION_KEY || '';
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 32) return decoded;
  throw new Error('MFA_ENCRYPTION_KEY must encode exactly 32 random bytes');
}
function encryptSecret(secret, env = process.env) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join('.');
}
function decryptSecret(value, env = process.env) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted MFA secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(parts[0], 'hex'));
  decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], 'hex')), decipher.final()]).toString('utf8');
}
function recoveryCode() { const raw = crypto.randomBytes(6).toString('hex').toUpperCase(); return raw.slice(0,6) + '-' + raw.slice(6); }
function hashRecoveryCode(code) { return crypto.createHash('sha256').update(String(code || '').replace(/-/g,'').toUpperCase()).digest('hex'); }
function safeEqual(left, right) {
  const a = Buffer.from(String(left || '')); const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a,b);
}
async function getCredential(config, userId) {
  const result = await getPool(config).query('SELECT user_id, secret_ciphertext, enabled FROM user_mfa_credentials WHERE user_id=$1 LIMIT 1', [userId]);
  return result.rows[0] || null;
}
async function createSetup(config, userId, env = process.env) {
  const pool = getPool(config); const existing = await getCredential(config, userId);
  if (existing && existing.enabled) throw new Error('MFA is already enabled for this account');
  const secret = generateSecret(); const encrypted = encryptSecret(secret, env);
  await pool.query(
    "INSERT INTO user_mfa_credentials (user_id,secret_ciphertext,enabled,confirmed_at) VALUES ($1,$2,false,NULL) ON CONFLICT (user_id) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,enabled=false,confirmed_at=NULL,created_at=NOW()",
    [userId, encrypted]
  );
  return { secret, otpauthUrl: 'otpauth://totp/ATSH%20AI:' + encodeURIComponent(userId) + '?secret=' + secret + '&issuer=ATSH%20AI&algorithm=SHA1&digits=6&period=30' };
}
async function confirmSetup(config, userId, code, env = process.env) {
  const pool = getPool(config); const credential = await getCredential(config, userId);
  if (!credential || credential.enabled) return null;
  const secret = decryptSecret(credential.secret_ciphertext, env);
  if (!verifyTotp(secret, code)) return null;
  const codes = Array.from({ length: 10 }, recoveryCode);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE user_mfa_credentials SET enabled=true,confirmed_at=NOW() WHERE user_id=$1 AND enabled=false', [userId]);
    await client.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1 AND used_at IS NULL', [userId]);
    for (const codeValue of codes) await client.query('INSERT INTO user_mfa_recovery_codes (user_id,code_hash) VALUES ($1,$2)', [userId, hashRecoveryCode(codeValue)]);
    await client.query('COMMIT');
    return codes;
  } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
  finally { client.release(); }
}
async function verifySecondFactor(config, userId, code, env = process.env) {
  const credential = await getCredential(config, userId);
  if (!credential || !credential.enabled) return false;
  if (/^\d{6}$/.test(String(code || ''))) {
    try { return verifyTotp(decryptSecret(credential.secret_ciphertext, env), code); } catch { return false; }
  }
  if (!/^[A-F0-9]{6}-[A-F0-9]{6}$/i.test(String(code || ''))) return false;
  const pool = getPool(config); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('UPDATE user_mfa_recovery_codes SET used_at=NOW() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING id', [userId, hashRecoveryCode(code)]);
    await client.query('COMMIT');
    return result.rowCount === 1;
  } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
  finally { client.release(); }
}
module.exports = { generateSecret, totpCode, verifyTotp, encryptSecret, decryptSecret, recoveryCode, hashRecoveryCode, safeEqual, getCredential, createSetup, confirmSetup, verifySecondFactor };
