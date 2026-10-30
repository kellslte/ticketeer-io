import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/** Brings the test database up to the latest migration once per e2e run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const pool = new pg.Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  } finally {
    await pool.end();
  }
}
