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
    const organizationMetadata = (await client.query(`SELECT o.slug, o.status,
      (SELECT count(*)::integer FROM service_categories c WHERE c.organization_id = o.id) AS category_count,
      (SELECT count(*)::integer FROM service_plans p WHERE p.organization_id = o.id) AS plan_count,
      (SELECT count(*)::integer FROM service_addons a WHERE a.organization_id = o.id) AS addon_count
      FROM organizations o WHERE o.slug = $1`, [process.env.DEFAULT_ORGANIZATION_SLUG || 'atsh-ai'])).rows;
    const passwordHashFormats = (await client.query(`SELECT CASE
      WHEN password_hash IS NULL OR password_hash = '' THEN 'empty'
      WHEN password_hash LIKE '$2a$%' OR password_hash LIKE '$2b$%' OR password_hash LIKE '$2y$%' THEN 'bcrypt'
      WHEN password_hash LIKE '$argon2%' THEN 'argon2'
      WHEN password_hash LIKE 'scrypt$%' THEN 'scrypt-prefixed'
      WHEN password_hash LIKE 'pbkdf2$%' THEN 'pbkdf2-prefixed'
      ELSE 'other-format'
      END AS format, count(*)::integer AS user_count
      FROM users GROUP BY 1 ORDER BY 1`)).rows;
    const passwordHashStructure = (await client.query(`SELECT split_part(password_hash, '(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, passwordHashStructure, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
, 1) AS format,
      array_length(string_to_array(password_hash, '(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
), 1)::integer AS segment_count,
      bool_or(split_part(password_hash, '(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
, 2) ~ '^[0-9]+(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
) AS part2_numeric,
      bool_or(split_part(password_hash, '(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
, 3) ~ '^[0-9]+(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
) AS part3_numeric,
      bool_or(split_part(password_hash, '(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
, 4) ~ '^[0-9]+(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
) AS part4_numeric,
      min(length(split_part(password_hash, '(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
, 2))) AS part2_min_length,
      min(length(split_part(password_hash, '(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
, 3))) AS part3_min_length,
      min(length(split_part(password_hash, '(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
, 4))) AS part4_min_length,
      min(length(split_part(password_hash, '(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
, 5))) AS part5_min_length,
      min(length(split_part(password_hash, '(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
, 6))) AS part6_min_length,
      count(*)::integer AS user_count
      FROM users WHERE password_hash IS NOT NULL AND password_hash <> ''
      GROUP BY 1,2 ORDER BY 1,2`)).rows;
    const roleSummary = (await client.query(`SELECT r.name, count(ur.user_id)::integer AS assigned_users
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.id, r.name ORDER BY r.name`)).rows;
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
    const inventory = { generatedAt: new Date().toISOString(), scope: 'metadata-only; no customer rows selected', organizationMetadata, passwordHashFormats, roleSummary, tables, columns, constraints, indexes };
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only schema inspection failed:', error.message); process.exitCode = 1; });
