import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { EmailAlreadyRegisteredError } from '../domain/errors.js';
import { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';
import { users } from './users.table.js';

const UNIQUE_VIOLATION = '23505';

// Drizzle wraps driver errors; the pg code may be on the error or on its cause.
const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === UNIQUE_VIOLATION || err?.cause?.code === UNIQUE_VIOLATION;
};

const toUser = (row: typeof users.$inferSelect): User => User.rehydrate(row);

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? toUser(row) : null;
  }

  async save(user: User): Promise<void> {
    const row = {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      role: user.role,
      createdAt: user.createdAt,
    };
    try {
      await this.db
        .insert(users)
        .values(row)
        .onConflictDoUpdate({ target: users.id, set: { name: row.name, passwordHash: row.passwordHash, role: row.role } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailAlreadyRegisteredError();
      throw error;
    }
  }
}
