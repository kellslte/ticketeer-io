import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../src/modules/identity/domain/password-hasher.js';
import type { Role } from '../src/modules/identity/domain/role.js';
import { TOKEN_ISSUER, type TokenIssuer } from '../src/modules/identity/domain/token-issuer.js';
import { User } from '../src/modules/identity/domain/user.js';
import { USER_REPOSITORY, type UserRepository } from '../src/modules/identity/domain/user.repository.js';
import { applyAppSettings } from '../src/setup-app.js';

/** DB-backed e2e tests only run when a test database is configured (always in CI). */
export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  applyAppSettings(app);
  await app.init();
  return app;
}

export async function resetDb(app: INestApplication): Promise<void> {
  const db = app.get<NodePgDatabase>(getDrizzleToken());
  await db.execute(sql`truncate table tickets, users, outbox restart identity cascade`);
}

export const PASSWORD = 'correct-horse-battery';

/** Inserts a user directly (skips the throttled /auth endpoints) and returns it with a valid bearer token. */
export async function createUser(app: INestApplication, role: Role = 'customer', email?: string) {
  const user = User.register({
    id: randomUUID(),
    email: email ?? `${role}-${randomUUID().slice(0, 8)}@example.com`,
    name: `Test ${role}`,
    passwordHash: await app.get<PasswordHasher>(PASSWORD_HASHER).hash(PASSWORD),
  });
  user.changeRole(role);
  await app.get<UserRepository>(USER_REPOSITORY).save(user);
  const { accessToken } = await app.get<TokenIssuer>(TOKEN_ISSUER).issue(user);
  return { user, token: accessToken, auth: { Authorization: `Bearer ${accessToken}` } };
}
