'use strict';
const { Pool } = require('pg');
let pool;
function getPool(config = require('./config').loadConfig()) {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required for the ATSH AI platform.');
  if (!pool) pool = new Pool({
    connectionString: config.databaseUrl,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.PGSSL === 'disable' ? false : (process.env.PGSSL === 'require' ? { rejectUnauthorized: true } : undefined),
    application_name: 'atsh-ai-platform'
  });
  return pool;
}
async function checkDatabase(config) {
  const result = await getPool(config).query('SELECT now() AS server_time');
  return { ok: true, serverTime: result.rows[0].server_time };
}
async function closePool() { if (pool) { const current = pool; pool = undefined; await current.end(); } }
module.exports = { getPool, checkDatabase, closePool };
