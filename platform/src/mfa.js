'use strict';
const crypto = require('node:crypto');
const { getPool } = require('./db');

function encryptionKey() {
  const value = process.env.MFA_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters.');
  return Buffer.from(value, 'hex');
}
function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}
function decryptSecret(value) {
  const [iv, tag, body] = String(value || '').split('.');
  if (!iv || !tag || !body) throw new Error('Invalid encrypted MFA secret.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer) {
  let bits = 0, value = 0, output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(text) {
  let bits = 0, value = 0; const output = [];
  for (const char of String(text).replace(/=+$/,'').toUpperCase()) {
    const n = alphabet.indexOf(char); if (n < 0) throw new Error('Invalid base32 secret.');
    value = (value << 5) | n; bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}
function generateSecret() { return base32Encode(crypto.randomBytes(20)); }
function totpAt(secret, step) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
function verifyTotp(secret, code, now = Date.now(), lastAcceptedStep = -1) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current - 1, current, current + 1]) {
    if (step <= lastAcceptedStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    if (crypto.timingSafeEqual(expected, Buffer.from(String(code)))) return step;
  }
  return null;
}
function recoveryCodes() { return Array.from({length: 10}, () => crypto.randomBytes(8).toString('hex').toUpperCase()); }
function hashRecovery(code) { return crypto.createHash('sha256').update(String(code || '').replace(/[^a-f0-9]/gi, '').toUpperCase()).digest('hex'); }
async function beginLoginChallenge(userId, res, production) {
  const token = crypto.randomBytes(32).toString('base64url');
  await getPool().query('DELETE FROM auth_mfa_challenges WHERE expires_at <= now() OR attempts >= 5');
  await getPool().query('DELETE FROM auth_mfa_challenges WHERE user_id=$1', [userId]);
  await getPool().query('INSERT INTO auth_mfa_challenges(user_id,token_hash,expires_at) VALUES($1,$2,$3)', [userId, crypto.createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 300000)]);
  res.cookie('atsh_platform_mfa_challenge', token, {httpOnly:true,secure:production,sameSite:'strict',path:'/api/admin/auth/mfa',maxAge:300000});
}
module.exports = { encryptionKey, encryptSecret, decryptSecret, generateSecret, verifyTotp, recoveryCodes, hashRecovery, beginLoginChallenge };
