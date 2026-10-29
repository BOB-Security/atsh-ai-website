'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'src/routes/portal.js'), 'utf8');

test('customer portal rejects sessions outside the configured organization', () => {
  assert.match(portal, /a\.organization_id!==req\.app\.locals\.organizationId/);
  assert.match(portal, /c\.organization_id=a\.organization_id/);
  assert.match(portal, /a\.status='active'/);
  assert.match(portal, /c\.status<>'blocked'/);
});

test('customer dashboard collections are scoped to the authenticated customer and organization', () => {
  for (const table of ['projects', 'quotes', 'support_tickets', 'leads', 'project_change_requests']) {
    const pattern = new RegExp(
      'FROM ' + table + '[\\s\\S]{0,500}organization_id=\\$1 AND customer_id=\\$2'
    );
    assert.match(portal, pattern, table + ' query must filter by organization and customer');
  }
  assert.match(portal, /p\.customer_id=\$2 AND u\.visibility='customer'/,
    'project updates must belong to the customer and be customer-visible');
});

test('customer portal project and ticket detail endpoints enforce ownership before returning data', () => {
  assert.match(portal, /p\.customer_id=\$3 AND u\.visibility='customer'/,
    'project updates endpoint must be customer-scoped');
  assert.match(portal, /t\.customer_id=\$3 AND m\.visibility='customer'/,
    'ticket messages must be customer-scoped and customer-visible');
  assert.match(portal, /WHERE id=\$1 AND organization_id=\$2 AND customer_id=\$3/,
    'ticket lookup must enforce organization and customer ownership');
});

test('customer-submitted tickets cannot attach projects owned by another customer', () => {
  assert.match(portal, /SELECT 1 FROM projects WHERE id=\$1 AND organization_id=\$2 AND customer_id=\$3/);
});

test('customer decisions are restricted to their own issued quotes and quoted change requests', () => {
  assert.match(portal, /WHERE id=\$1 AND organization_id=\$2 AND customer_id=\$3 AND status='issued'/);
  assert.match(portal, /WHERE id=\$1 AND organization_id=\$2 AND customer_id=\$3 AND status='quoted'/);
});
