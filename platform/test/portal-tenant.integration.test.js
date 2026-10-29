'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const enabled = Boolean(process.env.DATABASE_URL);
test('PostgreSQL customer portal queries isolate two customers across projects, quotes and support tickets', { skip: !enabled }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: true } : false });
  const db = await pool.connect();
  const suffix = crypto.randomBytes(6).toString('hex');
  try {
    await db.query('BEGIN');
    const org = (await db.query("INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id", ['Tenant isolation test ' + suffix, 'tenant-test-' + suffix])).rows[0].id;
    const orgB = (await db.query("INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id", ['Other tenant test ' + suffix, 'tenant-other-' + suffix])).rows[0].id;
    const customerA = (await db.query("INSERT INTO customers(organization_id,display_name,email) VALUES($1,$2,$3) RETURNING id", [org, 'Customer A', 'a-' + suffix + '@test.local'])).rows[0].id;
    const customerB = (await db.query("INSERT INTO customers(organization_id,display_name,email) VALUES($1,$2,$3) RETURNING id", [org, 'Customer B', 'b-' + suffix + '@test.local'])).rows[0].id;
    const customerC = (await db.query("INSERT INTO customers(organization_id,display_name,email) VALUES($1,$2,$3) RETURNING id", [orgB, 'Customer C', 'c-' + suffix + '@test.local'])).rows[0].id;
    const projectC = (await db.query("INSERT INTO projects(organization_id,customer_id,reference,name) VALUES($1,$2,$3,$4) RETURNING id", [orgB, customerC, 'PR-C-' + suffix, 'Project C'])).rows[0].id;
    const projectA = (await db.query("INSERT INTO projects(organization_id,customer_id,reference,name) VALUES($1,$2,$3,$4) RETURNING id", [org, customerA, 'PR-A-' + suffix, 'Project A'])).rows[0].id;
    const projectB = (await db.query("INSERT INTO projects(organization_id,customer_id,reference,name) VALUES($1,$2,$3,$4) RETURNING id", [org, customerB, 'PR-B-' + suffix, 'Project B'])).rows[0].id;
    const quoteA = (await db.query("INSERT INTO quotes(organization_id,customer_id,reference,snapshot) VALUES($1,$2,$3,$4::jsonb) RETURNING id", [org, customerA, 'Q-A-' + suffix, JSON.stringify({ test: true })])).rows[0].id;
    const quoteB = (await db.query("INSERT INTO quotes(organization_id,customer_id,reference,snapshot) VALUES($1,$2,$3,$4::jsonb) RETURNING id", [org, customerB, 'Q-B-' + suffix, JSON.stringify({ test: true })])).rows[0].id;
    const ticketA = (await db.query("INSERT INTO support_tickets(organization_id,customer_id,reference,subject) VALUES($1,$2,$3,$4) RETURNING id", [org, customerA, 'T-A-' + suffix, 'Ticket A'])).rows[0].id;
    const ticketB = (await db.query("INSERT INTO support_tickets(organization_id,customer_id,reference,subject) VALUES($1,$2,$3,$4) RETURNING id", [org, customerB, 'T-B-' + suffix, 'Ticket B'])).rows[0].id;
    await db.query("INSERT INTO support_ticket_messages(ticket_id,sender_type,body,visibility) VALUES($1,'staff','internal A note','internal'),($2,'staff','internal B note','internal'),($1,'customer','customer A reply','customer'),($2,'customer','customer B reply','customer')", [ticketA, ticketB]);

    const projects = await db.query('SELECT id FROM projects WHERE organization_id=$1 AND customer_id=$2', [org, customerA]);
    const quotes = await db.query('SELECT id FROM quotes WHERE organization_id=$1 AND customer_id=$2', [org, customerA]);
    const tickets = await db.query('SELECT id FROM support_tickets WHERE organization_id=$1 AND customer_id=$2', [org, customerA]);
    const messages = await db.query("SELECT m.body FROM support_ticket_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.id=$1 AND t.organization_id=$2 AND t.customer_id=$3 AND m.visibility='customer' ORDER BY m.body", [ticketA, org, customerA]);
    const wrongOrganizationProject = await db.query('SELECT id FROM projects WHERE id=$1 AND organization_id=$2 AND customer_id=$3', [projectC, org, customerA]);
    const wrongProject = await db.query('SELECT id FROM projects WHERE id=$1 AND organization_id=$2 AND customer_id=$3', [projectB, org, customerA]);
    const wrongQuote = await db.query("UPDATE quotes SET status='accepted' WHERE id=$1 AND organization_id=$2 AND customer_id=$3 RETURNING id", [quoteB, org, customerA]);
    const wrongTicket = await db.query('SELECT id FROM support_tickets WHERE id=$1 AND organization_id=$2 AND customer_id=$3', [ticketB, org, customerA]);

    assert.deepEqual(projects.rows.map(x => x.id), [projectA]);
    assert.deepEqual(quotes.rows.map(x => x.id), [quoteA]);
    assert.deepEqual(tickets.rows.map(x => x.id), [ticketA]);
    assert.deepEqual(messages.rows.map(x => x.body), ['customer A reply']);
    assert.equal(wrongOrganizationProject.rowCount, 0, 'Customer A must not read another organization project');
    assert.equal(wrongProject.rowCount, 0, 'Customer A must not read Customer B project');
    assert.equal(wrongQuote.rowCount, 0, 'Customer A must not mutate Customer B quote');
    assert.equal(wrongTicket.rowCount, 0, 'Customer A must not read Customer B ticket');
    assert.equal((await db.query("SELECT status FROM quotes WHERE id=$1", [quoteB])).rows[0].status, 'draft', 'cross-customer quote mutation must not occur');
  } finally {
    await db.query('ROLLBACK').catch(() => {});
    db.release();
    await pool.end();
  }
});
