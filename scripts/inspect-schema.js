'use strict';
// One-time metadata-only compatibility discovery; application rows are never selected.
const { Pool } = require('pg');
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: true } : false,
    max: 1, connectionTimeoutMillis: 8000, application_name: 'atsh-schema-readonly-audit'
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const tables = (await client.query(`SELECT table_schema, table_name, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name`)).rows;
    const columns = (await client.query(`SELECT table_schema, table_name, ordinal_position, column_name,
      data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name, ordinal_position`)).rows;
    const constraints = (await client.query(`SELECT tc.table_schema, tc.table_name, tc.constraint_name,
      tc.constraint_type, kcu.column_name, ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_catalog=kcu.constraint_catalog AND tc.constraint_schema=kcu.constraint_schema
       AND tc.constraint_name=kcu.constraint_name AND tc.table_name=kcu.table_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_catalog=ccu.constraint_catalog AND tc.constraint_schema=ccu.constraint_schema
       AND tc.constraint_name=ccu.constraint_name AND tc.table_name=ccu.table_name
      WHERE tc.table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position`)).rows;
    const indexes = (await client.query(`SELECT schemaname AS schema_name, tablename AS table_name, indexname, indexdef
      FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema')
      ORDER BY schemaname, tablename, indexname`)).rows;
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no application rows selected', tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
