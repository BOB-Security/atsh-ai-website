'use strict';
const { Pool } = require('pg');

const INQUIRY_COLUMNS = {
  customers: ['id','organization_id','display_name','email','phone','preferred_locale','status','source','created_at','updated_at'],
  leads: ['id','organization_id','customer_id','reference','status','source','project_goal','solution_type','brief','consent_at','created_at','updated_at']
};

function createDatabase(config) {
  let pool;
  function getPool() {
    if (!config.databaseUrl) { const e = new Error('DATABASE_URL is not configured'); e.code = 'DATABASE_NOT_CONFIGURED'; throw e; }
    if (!pool) {
      pool = new Pool({ connectionString: config.databaseUrl, max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000, application_name: 'atsh-ai-greenfield', ssl: config.pgSsl === 'disable' ? false : config.pgSsl === 'require' ? { rejectUnauthorized: true } : undefined });
      pool.on('error', error => console.error('PostgreSQL idle client error:', error.code || 'unknown'));
    }
    return pool;
  }
  async function checkConnection() {
    const result = await getPool().query('SELECT 1 AS connected');
    return result.rows[0] && result.rows[0].connected === 1;
  }
  async function inspectSchema() {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN READ ONLY');
      const result = await client.query("SELECT table_schema, table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name, ordinal_position");
      await client.query('COMMIT');
      return result.rows;
    } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
    finally { client.release(); }
  }
  async function createInquiry(input) {
    if (!config.intakeEnabled || !config.publicOrganizationId) {
      const error = new Error('Inquiry intake has not been enabled after schema review.');
      error.code = 'INTAKE_NOT_ENABLED';
      throw error;
    }
    const client = await getPool().connect();
    try {
      const schema = await client.query(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('customers','leads')"
      );
      const found = new Map();
      for (const row of schema.rows) {
        if (!found.has(row.table_name)) found.set(row.table_name, new Set());
        found.get(row.table_name).add(row.column_name);
      }
      for (const [table, required] of Object.entries(INQUIRY_COLUMNS)) {
        if (!found.has(table) || required.some(column => !found.get(table).has(column))) {
          const error = new Error('Required inquiry schema has not been verified.');
          error.code = 'INTAKE_SCHEMA_MISMATCH';
          throw error;
        }
      }

      await client.query('BEGIN');
      const existing = await client.query(
        "SELECT id FROM customers WHERE organization_id = $1 AND lower(email) = lower($2) LIMIT 1",
        [config.publicOrganizationId, input.email]
      );
      let customerId;
      if (existing.rows[0]) {
        customerId = existing.rows[0].id;
      } else {
        const createdCustomer = await client.query(
          "INSERT INTO customers (organization_id, display_name, email, phone, preferred_locale, status, source) VALUES ($1,$2,$3,$4,'ar','lead','website') ON CONFLICT (organization_id, email) DO NOTHING RETURNING id",
          [config.publicOrganizationId, input.name, input.email, input.phone || null]
        );
        if (createdCustomer.rows[0]) {
          customerId = createdCustomer.rows[0].id;
        } else {
          const raced = await client.query(
            "SELECT id FROM customers WHERE organization_id = $1 AND lower(email) = lower($2) LIMIT 1",
            [config.publicOrganizationId, input.email]
          );
          if (!raced.rows[0]) throw new Error('Customer could not be resolved after concurrent insert.');
          customerId = raced.rows[0].id;
        }
      }

      const reference = 'ATSH-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + require('node:crypto').randomBytes(4).toString('hex').toUpperCase();
      const brief = {
        company: input.company || '',
        service: input.service,
        size: input.size || '',
        pages: input.pages || '',
        languages: input.languages || '',
        brand: input.brand || '',
        features: input.features || [],
        hosting: input.hosting || '',
        audience: input.audience || '',
        integrations: input.integrations || '',
        deadline: input.deadline || '',
        constraints: input.constraints || ''
      };
      const createdLead = await client.query(
        "INSERT INTO leads (organization_id, customer_id, reference, status, source, project_goal, solution_type, brief, consent_at) VALUES ($1,$2,$3,'new','website',$4,$5,$6::jsonb,now()) RETURNING id, reference, status, created_at",
        [config.publicOrganizationId, customerId, reference, input.goal, input.service, JSON.stringify(brief)]
      );
      await client.query('COMMIT');
      return createdLead.rows[0];
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }
  async function close() { if (pool) { const current = pool; pool = undefined; await current.end(); } }
  return { checkConnection, inspectSchema, createInquiry, close };
}
module.exports = { createDatabase };
