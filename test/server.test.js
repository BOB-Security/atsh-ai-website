'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const port = 39187;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atsh-ai-test-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_PATH: path.join(tempDir, 'test.sqlite'), ADMIN_API_TOKEN: 'test-only-admin-token-0123456789-abcdefghijklmnopqrstuvwxyz' },
  stdio: 'ignore'
});
const base = 'http://127.0.0.1:' + port;

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Server exited before becoming ready');
    try {
      const response = await fetch(base + '/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server did not become ready');
}

after(() => {
  child.kill('SIGTERM');
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('health endpoint responds successfully', async () => {
  await waitForServer();
  const response = await fetch(base + '/api/health');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});

test('contact submissions validate and persist with a reference', async () => {
  await waitForServer();
  const response = await fetch(base + '/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
      subject: 'Test request',
      message: 'This is a test inquiry with enough detail.'
    })
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.match(result.reference, /^ATS-\d{6}$/);
});

test('invalid email is rejected', async () => {
  await waitForServer();
  const response = await fetch(base + '/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email: 'not-an-email', message: 'A sufficiently long message.' })
  });
  assert.equal(response.status, 400);
});

test('public company pages and shared assets are served', async () => {
  await waitForServer();
  for (const file of [
    '/index.html',
    '/services.html',
    '/products.html',
    '/work.html',
    '/about.html',
    '/contact.html',
    '/privacy.html',
    '/terms.html',
    '/pages.css',
    '/site.js',
    '/contact.js',
    '/admin.html',
    '/admin.js'
  ]) {
    const response = await fetch(base + file);
    assert.equal(response.status, 200, file + ' should be public');
  }
});

test('repository internals are not served as static assets', async () => {
  await waitForServer();
  for (const file of [
    '/server.js',
    '/package.json',
    '/docs/BACKEND_IMPLEMENTATION_STATUS.md',
    '/test/server.test.js',
    '/.github/workflows/ci.yml',
    '/data/atsh-ai.sqlite'
  ]) {
    const response = await fetch(base + file);
    assert.equal(response.status, 404, file + ' should not be public');
  }
});


test('all company pages share navigation and legal footer links', () => {
  const root = path.resolve(__dirname, '..');
  const pages = ['index.html', 'services.html', 'products.html', 'work.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html'];
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /<html lang="ar" dir="rtl">/, file + ' should declare Arabic RTL');
    for (const target of pages) {
      assert.ok(html.includes('href="' + target + '"'), file + ' should link to ' + target);
    }
  }
  const contact = fs.readFileSync(path.join(root, 'contact.html'), 'utf8');
  assert.ok(contact.includes('<script src="contact.js"></script>'), 'contact page should load its form handler');
  assert.ok(contact.includes('id="privacyConsent"'), 'contact form should require privacy consent');
});


test('admin inbox rejects requests without the bearer token', async () => {
  await waitForServer();
  const response = await fetch(base + '/api/admin/submissions');
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('admin inbox lists saved submissions and updates status with valid token', async () => {
  await waitForServer();
  const token = 'test-only-admin-token-0123456789-abcdefghijklmnopqrstuvwxyz';
  const list = await fetch(base + '/api/admin/submissions', {
    headers: { authorization: 'Bearer ' + token }
  });
  assert.equal(list.status, 200);
  const data = await list.json();
  assert.ok(Array.isArray(data.submissions));
  assert.ok(data.submissions.length >= 1);
  const submission = data.submissions[0];

  const update = await fetch(base + '/api/admin/submissions/' + submission.id + '/status', {
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'reviewing' })
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).status, 'reviewing');
});

test('admin inbox rejects invalid status filters and updates', async () => {
  await waitForServer();
  const token = 'test-only-admin-token-0123456789-abcdefghijklmnopqrstuvwxyz';
  const list = await fetch(base + '/api/admin/submissions?status=made-up', {
    headers: { authorization: 'Bearer ' + token }
  });
  assert.equal(list.status, 400);
  const update = await fetch(base + '/api/admin/submissions/1/status', {
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'made-up' })
  });
  assert.equal(update.status, 400);
});
