import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { Argon2PasswordHasher } from '../src/modules/identity/infrastructure/argon2-password-hasher.js';
import { DrizzleUserRepository } from '../src/modules/identity/infrastructure/drizzle-user.repository.js';
import { normalizeEmail, User } from '../src/modules/identity/domain/user.js';

/**
 * Idempotent: creates the admin, or does nothing if it already exists. Safe to run on every deploy.
 * It never promotes an existing non-admin account: registration is open and emails are unverified,
 * so anyone could pre-register ADMIN_EMAIL with their own password and be handed admin by the seed.
 */
export async function seedAdmin(
  db: NodePgDatabase,
  email: string,
  password: string,
): Promise<'created' | 'unchanged'> {
  const users = new DrizzleUserRepository(db);
  const existing = await users.findByEmail(normalizeEmail(email));

  if (existing) {
    if (existing.role === 'admin') return 'unchanged';
    throw new Error(
      `${email} belongs to an existing non-admin account; refusing to promote it. ` +
        'Delete that account, or promote it through PATCH /users/:id/role as an admin.',
    );
  }

  const admin = User.register({
    id: randomUUID(),
    email,
    name: 'Administrator',
    passwordHash: await new Argon2PasswordHasher().hash(password),
  });
  admin.changeRole('admin');
  await users.save(admin);
  return 'created';
}

// Run with `bun run db:seed` (bun loads .env automatically).
if (import.meta.main) {
  const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) {
    console.error('DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD (min 10 chars) are required');
    process.exit(1);
  }
  const db = drizzle(DATABASE_URL);
  try {
    console.log(`Admin ${ADMIN_EMAIL}: ${await seedAdmin(db, ADMIN_EMAIL, ADMIN_PASSWORD)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}
