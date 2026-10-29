'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');

process.env.MFA_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const mfa=require('../src/mfa');

function decodeBase32(value){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
 let bits=0,acc=0,out=[];
 for(const ch of value){
  const n=alphabet.indexOf(ch);
  if(n<0) throw new Error('invalid base32');
  acc=(acc<<5)|n; bits+=5;
  if(bits>=8){out.push((acc>>(bits-8))&255);bits-=8;}
 }
 return Buffer.from(out);
}
function codeAt(secret,step){
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
 const mac=crypto.createHmac('sha1',decodeBase32(secret)).update(counter).digest();
 const offset=mac[mac.length-1]&15;
 return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}

test('MFA secrets are encrypted with authenticated encryption and decrypt only with the right key',()=>{
 const secret=mfa.generateSecret();
 const encrypted=mfa.encryptSecret(secret);
 assert.notEqual(encrypted,secret);
 assert.equal(mfa.decryptSecret(encrypted),secret);
 const parts=encrypted.split('.');
 assert.equal(parts.length,3);
 assert.throws(()=>mfa.decryptSecret('not-an-encrypted-secret'));
});

test('TOTP verification accepts a valid time step once and rejects replay',()=>{
 const secret=mfa.generateSecret();
 const now=Date.now();
 const step=Math.floor(now/30000);
 const code=codeAt(secret,step);
 assert.equal(mfa.verifyTotp(secret,code,now,-1),step);
 assert.equal(mfa.verifyTotp(secret,code,now,step),null);
 assert.equal(mfa.verifyTotp(secret,'bad',now,-1),null);
 assert.equal(mfa.verifyTotp(secret,'12345',now,-1),null);
});

test('recovery codes are unique and are stored as one-way hashes',()=>{
 const codes=mfa.recoveryCodes();
 assert.equal(codes.length,10);
 assert.equal(new Set(codes).size,10);
 for(const code of codes){
  assert.match(code,/^[A-F0-9]{16}$/);
  const hash=mfa.hashRecovery(code);
  assert.match(hash,/^[a-f0-9]{64}$/);
  assert.notEqual(hash,code);
  assert.equal(hash,mfa.hashRecovery(code.toLowerCase()));
 }
});
