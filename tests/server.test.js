'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server');

let base;
test.before(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('health endpoint returns ok', async () => {
  const res = await fetch(base + '/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: 'atsh-ai-website' });
});
test('homepage serves HTML', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /atsh-ai/);
  assert.match(html, /id="project-form"/);
});
test('admin portal route serves a clearly inactive, noindex entry page', async () => {
  const res = await fetch(base + '/admin');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /دخول الإدارة/);
  assert.match(html, /دخول المالك/);
});
test('admin API requires authentication', async () => {
  const res = await fetch(base + '/api/admin/content');
  assert.equal(res.status, 401);
});
test('public CMS content endpoint is available', async () => {
  const res = await fetch(base + '/api/site-content');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.pages));
  assert.ok(Array.isArray(body.blocks));
});
test('staff portal is served', async () => {
  const res = await fetch(base + '/staff/login');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /staff-login-form/);
});
test('unknown file returns 404', async () => {
  const res = await fetch(base + '/missing-file.js');
  assert.equal(res.status, 404);
});
test('inquiry endpoint is honest when no receiving integration is configured', async () => {
  const old = process.env.INQUIRY_WEBHOOK_URL;
  delete process.env.INQUIRY_WEBHOOK_URL;
  try {
    const res = await fetch(base + '/api/project-inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email: 'test@example.com', message: 'A test request', language: 'en' })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /not activated/i);
  } finally {
    if (old !== undefined) process.env.INQUIRY_WEBHOOK_URL = old;
  }
});
