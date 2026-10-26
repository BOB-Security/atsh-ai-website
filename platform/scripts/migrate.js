'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { getPool, closePool } = require('../src/db');
(async () => {
  const db = getPool();
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const dir = path.resolve(__dirname, '../../db');
    const files = (await fs.readdir(dir)).filter(f => /^\d+.*\.sql$/.test(f)).sort();
    for (const filename of files) {
      const found = await db.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
      if (found.rowCount) continue;
      const sql = await fs.readFile(path.join(dir, filename), 'utf8');
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        process.stdout.write(`Applied ${filename}\n`);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await closePool(); }
})();
