import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../identity/infrastructure/users.table.js';

export const ticketStatus = pgEnum('ticket_status', ['open', 'in_progress', 'resolved', 'closed']);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey(),
    title: varchar('title', { length: 120 }).notNull(),
    description: text('description').notNull(),
    status: ticketStatus('status').notNull().default('open'),
    requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    resolvedAt: timestamptz('resolved_at'),
    deletedAt: timestamptz('deleted_at'),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    index('tickets_status_created_idx').on(t.status, t.createdAt),
    index('tickets_requester_idx').on(t.requesterId),
    index('tickets_assignee_idx').on(t.assigneeId),
  ],
);
