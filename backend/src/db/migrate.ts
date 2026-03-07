import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/oxelite_dev',
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('Running database migrations...\n');

    // Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const applied = await client.query('SELECT filename FROM schema_migrations');
    const appliedSet = new Set(applied.rows.map(r => r.filename));

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    let appliedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`⏭ ${file} (already applied)`);
        continue;
      }

      console.log(`Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✓ ${file} applied successfully\n`);
        appliedCount++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    if (appliedCount === 0) {
      console.log('\nNo new migrations to apply.');
    } else {
      console.log(`\n${appliedCount} migration(s) applied successfully!`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error(error);
  process.exit(1);
});
