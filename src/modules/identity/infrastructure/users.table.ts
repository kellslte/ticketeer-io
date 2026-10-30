import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['customer', 'agent', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  // Stored lowercase (see normalizeEmail), so a plain unique constraint is case-insensitive.
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('customer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
