import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, count, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { enqueue } from '../../../shared/infrastructure/outbox.table.js';
import { ConcurrentModificationError } from '../domain/errors.js';
import { TicketAssigned, TicketStatusChanged } from '../domain/events.js';
import { Ticket } from '../domain/ticket.js';
import type { TicketRepository, TicketSearch } from '../domain/ticket.repository.js';
import { tickets } from './tickets.table.js';

const toTicket = (row: typeof tickets.$inferSelect): Ticket => Ticket.rehydrate(row);

// The one place that hides soft-deleted rows: every read goes through it.
const alive = isNull(tickets.deletedAt);

@Injectable()
export class DrizzleTicketRepository implements TicketRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  async findById(id: string): Promise<Ticket | null> {
    const [row] = await this.db.select().from(tickets).where(and(eq(tickets.id, id), alive)).limit(1);
    return row ? toTicket(row) : null;
  }

  async search(criteria: TicketSearch): Promise<{ items: Ticket[]; total: number }> {
    const filters: SQL[] = [alive];
    if (criteria.status) filters.push(eq(tickets.status, criteria.status));
    if (criteria.assigneeId) filters.push(eq(tickets.assigneeId, criteria.assigneeId));
    if (criteria.requesterId) filters.push(eq(tickets.requesterId, criteria.requesterId));
    const where = and(...filters);
    const direction = criteria.sort === 'asc' ? asc : desc;

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(tickets)
        .where(where)
        // id as a tiebreaker keeps pages stable when createdAt collides
        .orderBy(direction(tickets.createdAt), direction(tickets.id))
        .limit(criteria.limit)
        .offset((criteria.page - 1) * criteria.limit),
      this.db.select({ total: count() }).from(tickets).where(where),
    ]);
    return { items: rows.map(toTicket), total: totals?.total ?? 0 };
  }

  /** Re-load the ticket after saving if you need the new version: the instance keeps the one it was loaded with. */
  async save(ticket: Ticket): Promise<void> {
    // Notifications go to the outbox in the same transaction as the ticket, so they are never lost or sent for a rolled-back change.
    await this.db.transaction(async (tx) => {
      await this.write(tx, ticket);
      for (const e of ticket.pendingEvents) {
        if (e instanceof TicketAssigned && e.assigneeId) {
          await enqueue(tx, 'ticket.assigned', { ticketId: e.aggregateId, assigneeId: e.assigneeId, actorId: e.actorId });
        } else if (e instanceof TicketStatusChanged) {
          await enqueue(tx, 'ticket.status_changed', { ticketId: e.aggregateId, from: e.from, to: e.to, actorId: e.actorId });
        }
      }
    });
  }

  private async write(db: Pick<NodePgDatabase, 'insert' | 'update'>, ticket: Ticket): Promise<void> {
    const s = ticket.snapshot();
    // version 0 = never persisted (see Ticket.create)
    if (s.version === 0) {
      await db.insert(tickets).values({ ...s, version: 1 });
      return;
    }

    const updated = await db
      .update(tickets)
      .set({
        title: s.title,
        description: s.description,
        status: s.status,
        assigneeId: s.assigneeId,
        updatedAt: s.updatedAt,
        resolvedAt: s.resolvedAt,
        deletedAt: s.deletedAt,
        version: sql`${tickets.version} + 1`,
      })
      .where(and(eq(tickets.id, s.id), eq(tickets.version, s.version)))
      .returning({ id: tickets.id });
    if (updated.length === 0) throw new ConcurrentModificationError();
  }
}
