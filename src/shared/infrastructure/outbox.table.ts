import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Transactional outbox: rows are inserted in the same transaction as the state change they
 * describe, then delivered (at least once) by the OutboxWorker. Handlers must be idempotent-ish.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [index('outbox_pending_idx').on(t.nextAttemptAt).where(sql`${t.processedAt} is null`)],
);

/** Accepts the pool or a transaction: pass the `tx` so the message commits or rolls back with the write. */
export const enqueue = (db: Pick<NodePgDatabase, 'insert'>, type: string, payload: Record<string, unknown>) =>
  db.insert(outbox).values({ type, payload });
