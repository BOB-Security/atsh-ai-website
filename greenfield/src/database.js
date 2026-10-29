'use strict';
const { Pool } = require('pg');
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
  async function checkConnection() { const result = await getPool().query('SELECT 1 AS connected'); return result.rows[0] && result.rows[0].connected === 1; }
  async function inspectSchema() {
    const client = await getPool().connect();
    try { await client.query('BEGIN READ ONLY'); const result = await client.query("SELECT table_schema, table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name, ordinal_position"); await client.query('COMMIT'); return result.rows; }
    catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
    finally { client.release(); }
  }
  async function close() { if (pool) { const current = pool; pool = undefined; await current.end(); } }
  return { checkConnection, inspectSchema, close };
}
module.exports = { createDatabase };
