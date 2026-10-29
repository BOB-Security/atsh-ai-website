'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectPortalCompatibility, REQUIRED_PORTAL_COLUMNS } = require('../src/portal-schema');

function rowsFor(requirements) {
  return Object.entries(requirements).flatMap(([table_name, names]) =>
    names.map(column_name => ({ table_schema: 'public', table_name, column_name }))
  );
}

test('portal schema gate accepts only complete required public tables', () => {
  const result = inspectPortalCompatibility(rowsFor(REQUIRED_PORTAL_COLUMNS));
  assert.equal(result.readOnly, true);
  assert.equal(result.ready, true);
  assert.deepEqual(result.missingRequired, []);
});

test('portal schema gate lists missing tables and columns without writes', () => {
  const result = inspectPortalCompatibility([
    { table_schema: 'public', table_name: 'customers', column_name: 'id' },
    { table_schema: 'private', table_name: 'projects', column_name: 'id' }
  ]);
  assert.equal(result.ready, false);
  assert.ok(result.missingRequired.some(item => item.table === 'customer_portal_accounts'));
  assert.ok(result.missingRequired.some(item => item.table === 'customers' && item.missingColumns.includes('organization_id')));
  assert.equal(result.readOnly, true);
});

test('portal schema gate ignores non-public schema metadata', () => {
  const result = inspectPortalCompatibility([
    ...rowsFor(REQUIRED_PORTAL_COLUMNS),
    { table_schema: 'internal', table_name: 'customer_portal_accounts', column_name: 'dangerous_column' }
  ]);
  assert.equal(result.ready, true);
  assert.equal(result.required.find(item => item.table === 'customer_portal_accounts').missingColumns.length, 0);
});
