'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after } = test;
const { app } = require('../server');
let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
});
test('health endpoint reports process liveness', async () => {
  const response = await fetch(base + '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'atsh-ai-platform', version: '2.0.0' });
});
test('readiness fails closed when the database is not configured', async () => {
  const response = await fetch(base + '/ready');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).reason, 'database_not_configured');
});
test('catalog does not invent services or prices before database mapping', async () => {
  const response = await fetch(base + '/api/public/catalog');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'catalog_unavailable');
});
test('project intake never reports success before persistence is configured', async () => {
  const response = await fetch(base + '/api/public/project-inquiries', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test', email: 'test@example.com', brief: 'A sufficiently long project brief', serviceType: 'website', scope: 'small', brand: 'ready', hosting: 'later', languages: ['ar'], addons: [], consent: true })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'intake_unavailable');
});

test('admin endpoints require an authenticated session', async () => {
  const me = await fetch(base + '/api/admin/me');
  assert.equal(me.status, 401);
  const catalog = await fetch(base + '/api/admin/catalog');
  assert.equal(catalog.status, 401);
});
test('admin login rejects empty credentials without connecting to the database', async () => {
  const response = await fetch(base + '/api/admin/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email:'',password:''}) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'invalid_credentials');
});
test('MFA bootstrap is disabled unless a protected deployment token is configured', async () => {
  const response = await fetch(base + '/api/admin/mfa/setup', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email:'owner@example.com',password:'not-a-real-password',bootstrapToken:''}) });
  assert.equal(response.status, 403);
});
