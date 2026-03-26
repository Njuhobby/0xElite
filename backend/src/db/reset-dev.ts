import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const connString = process.env.DATABASE_URL || 'postgresql://localhost:5432/oxelite_dev';

// Parse database name from connection string
const url = new URL(connString);
const dbName = url.pathname.slice(1);

// Connect to the default 'postgres' database to drop/create the target DB
url.pathname = '/postgres';
const adminPool = new Pool({ connectionString: url.toString() });

async function resetDatabase() {
  const client = await adminPool.connect();
  try {
    console.log(`Dropping database "${dbName}"...`);
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`✓ Dropped "${dbName}"`);

    console.log(`Creating database "${dbName}"...`);
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✓ Created "${dbName}"`);
  } finally {
    client.release();
    await adminPool.end();
  }

  // Run migrations on the fresh database
  console.log('\nRunning migrations...\n');
  const pool = new Pool({ connectionString: connString });
  const mc = await pool.connect();

  try {
    await mc.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await mc.query('BEGIN');
      try {
        await mc.query(sql);
        await mc.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await mc.query('COMMIT');
        console.log(`✓ ${file}`);
      } catch (error) {
        await mc.query('ROLLBACK');
        throw error;
      }
    }

    console.log(`\n✓ Database reset complete. ${files.length} migration(s) applied.`);
  } finally {
    mc.release();
    await pool.end();
  }
}

resetDatabase().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
