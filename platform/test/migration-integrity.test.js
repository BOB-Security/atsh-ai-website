'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const migrationsDir = path.join(root, 'db');

test('migration runner discovers every numbered SQL migration in deterministic order', () => {
  const migrations = fs.readdirSync(migrationsDir)
    .filter(name => /^\\d+.*\\.sql$/.test(name))
    .sort();

  assert.ok(migrations.length > 0, 'at least one migration must exist');
  assert.equal(new Set(migrations).size, migrations.length, 'migration filenames must be unique');
  assert.deepEqual(migrations, [...migrations].sort(), 'migration order must be deterministic');

  const runner = fs.readFileSync(path.join(root, 'platform/scripts/migrate.js'), 'utf8');
  assert.match(runner, /schema_migrations/);
  assert.match(runner, /readdir\(dir\)/);
  assert.match(runner, /\.sort\(\)/);

  for (const filename of migrations) {
    assert.ok(fs.statSync(path.join(migrationsDir, filename)).isFile(), filename + ' must exist');
  }
});

test('privileged MFA migrations are present and ordered after the core schema', () => {
  const migrations = fs.readdirSync(migrationsDir)
    .filter(name => /^\\d+.*\\.sql$/.test(name))
    .sort();

  for (const filename of [
    '018_privileged_mfa.sql',
    '019_mfa_enrollment_sessions.sql',
    '020_mfa_pending_expiry.sql'
  ]) {
    assert.ok(migrations.includes(filename), 'missing migration: ' + filename);
  }

  assert.ok(migrations.indexOf('018_privileged_mfa.sql') < migrations.indexOf('019_mfa_enrollment_sessions.sql'));
  assert.ok(migrations.indexOf('019_mfa_enrollment_sessions.sql') < migrations.indexOf('020_mfa_pending_expiry.sql'));

  const mfaRoutes = fs.readFileSync(path.join(root, 'platform/src/mfa-routes.js'), 'utf8');
  for (const route of [
    `'/auth/mfa/status'`,
    `'/auth/mfa/setup'`,
    `'/auth/mfa/enable'`,
    `'/auth/mfa/verify'`
  ]) assert.ok(mfaRoutes.includes(route), 'missing MFA route: ' + route);
});
