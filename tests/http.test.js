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
  assert.equal((await response.json()).error, 'catalog_not_configured');
});
test('project intake never reports success before persistence is configured', async () => {
  const response = await fetch(base + '/api/public/project-inquiries', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test', email: 'test@example.com', brief: 'test' })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'intake_not_configured');
});
