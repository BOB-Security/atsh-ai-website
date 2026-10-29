'use strict';const test=require('node:test');const assert=require('node:assert/strict');const {loadConfig}=require('../src/config');const {calculateQuote}=require('../src/pricing');test('safe config defaults',()=>{const c=loadConfig({});assert.equal(c.port,8080);assert.equal(c.organizationSlug,'atsh-ai');assert.equal(c.pgSsl,'disable');});test('reject invalid port',()=>assert.throws(()=>loadConfig({PORT:'70000'}),/PORT/));test('production defaults to TLS',()=>assert.equal(loadConfig({NODE_ENV:'production'}).pgSsl,'require'));test('quote uses catalog values and recurring periods',()=>{const q=calculateQuote([{id:'web',quantity:2},{id:'care',period:'monthly'}],[{id:'web',name:'Website',setupAmountMinor:150000,monthlyAmountMinor:0,annualAmountMinor:0,currency:'EGP',active:true},{id:'care',name:'Care',setupAmountMinor:0,monthlyAmountMinor:25000,annualAmountMinor:250000,currency:'EGP',active:true}]);assert.equal(q.totalMinor,325000);assert.equal(q.lines[1].period,'monthly');});test('quote rejects unavailable item',()=>assert.throws(()=>calculateQuote([{id:'fake',price:1}],[]),/unavailable/));test('quote rejects mixed currencies',()=>assert.throws(()=>calculateQuote([{id:'x'}],[{id:'x',name:'X',setupAmountMinor:100,currency:'USD',active:true}]),/Mixed currencies/));

const { validateInquiry, makeReference } = require('../src/intake');
test('inquiry validation normalizes email and accepts only approved form fields', () => {
  const result = validateInquiry({ name: ' Test User ', email: 'TEST@example.com', brief: 'Build a small website', serviceType: 'website', scope: 'small', brand: 'ready', hosting: 'later', languages: ['ar','en','ar'], addons: ['seo'], consent: true });
  assert.equal(result.name, 'Test User');
  assert.equal(result.email, 'test@example.com');
  assert.deepEqual(result.languages, ['ar','en']);
});
test('inquiry validation rejects invalid email, missing consent and unsupported choices', () => {
  const base = { name: 'Test', email: 'test@example.com', brief: 'A sufficiently long project brief', serviceType: 'website', scope: 'small', brand: 'ready', hosting: 'later', languages: ['ar'], addons: [], consent: true };
  assert.throws(() => validateInquiry({ ...base, email: 'bad-email' }), /valid email/);
  assert.throws(() => validateInquiry({ ...base, consent: false }), /consent/);
  assert.throws(() => validateInquiry({ ...base, serviceType: 'unknown-code' }), /service type/);
});
test('public references have the ATSH date-based format', () => {
  assert.match(makeReference(new Date('2026-10-29T12:00:00Z')), /^ATSH-20261029-[A-F0-9]{8}$/);
});

const crypto = require('node:crypto');
const { verifyPassword } = require('../src/auth');
test('scrypt password verification supports the existing stored hash format', async () => {
  const password = 'correct horse battery staple';
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { maxmem: 64 * 1024 * 1024 });
  const stored = 'scrypt$' + salt.toString('hex') + '$' + derived.toString('hex');
  assert.equal(await verifyPassword(password, stored), true);
  assert.equal(await verifyPassword('wrong password', stored), false);
});

const { normalizeQuoteItems } = require('../src/admin-operations');
test('quote line items calculate every billing period on the server', () => {
  const quote=normalizeQuoteItems([{description:'Website delivery',quantity:2,unit_setup_minor:15000,unit_monthly_minor:1000,unit_annual_minor:10000}]);
  assert.equal(quote.setupTotal,30000);
  assert.equal(quote.monthlyTotal,2000);
  assert.equal(quote.annualTotal,20000);
  assert.equal(quote.items[0].setup_total_minor,30000);
});
test('quote calculation rejects empty, zero-price and invalid-quantity quotes', () => {
  assert.throws(()=>normalizeQuoteItems([]),/between 1 and 50/);
  assert.throws(()=>normalizeQuoteItems([{description:'Free',quantity:1}]),/non-zero amount/);
  assert.throws(()=>normalizeQuoteItems([{description:'Bad',quantity:0,unit_setup_minor:100}]),/quantity/);
});
