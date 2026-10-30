import type { Ticket } from '../domain/ticket.js';

/** The public shape of a ticket. Never expose the aggregate or a database row directly. */
export const toTicketResponse = (t: Ticket) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  status: t.status,
  requesterId: t.requesterId,
  assigneeId: t.assigneeId,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  resolvedAt: t.resolvedAt,
});
