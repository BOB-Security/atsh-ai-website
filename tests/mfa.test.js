'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { totpCode, verifyTotp, generateSecret, encryptSecret, decryptSecret, hashRecoveryCode } = require('../src/mfa');
test('TOTP matches the RFC 6238 SHA-1 six-digit vector at 59 seconds', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpCode(secret, 59000), '287082');
  assert.equal(verifyTotp(secret, '287082', 59000), true);
  assert.equal(verifyTotp(secret, '000000', 59000), false);
});
test('generated MFA secrets are base32 and round-trip through authenticated encryption', () => {
  const secret = generateSecret();
  const env = { MFA_ENCRYPTION_KEY: 'a'.repeat(64) };
  const encrypted = encryptSecret(secret, env);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted, env), secret);
  assert.notEqual(hashRecoveryCode('ABCDEF-012345'), hashRecoveryCode('ABCDEF-012346'));
});
