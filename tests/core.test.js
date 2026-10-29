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
