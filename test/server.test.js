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
  env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_PATH: path.join(tempDir, 'test.sqlite') },
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

test('internal server files are not served as static assets', async () => {
  await waitForServer();
  for (const file of ['/server.js', '/package.json', '/docs/BACKEND_IMPLEMENTATION_STATUS.md']) {
    const response = await fetch(base + file);
    assert.equal(response.status, 404, file + ' should not be public');
  }
});
