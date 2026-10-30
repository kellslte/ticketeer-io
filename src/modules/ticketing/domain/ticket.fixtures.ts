import type { Actor } from './actor.js';
import { Ticket, type TicketProps } from './ticket.js';

export const customer: Actor = { id: 'cust-1', role: 'customer' };
export const otherCustomer: Actor = { id: 'cust-2', role: 'customer' };
export const agent: Actor = { id: 'agent-1', role: 'agent' };
export const admin: Actor = { id: 'admin-1', role: 'admin' };

export const makeTicket = (overrides: Partial<TicketProps> = {}): Ticket => {
  const at = new Date('2026-01-01T00:00:00Z');
  return Ticket.rehydrate({
    id: 't-1',
    title: 'Printer is on fire',
    description: 'The office printer is visibly on fire.',
    status: 'open',
    requesterId: customer.id,
    assigneeId: null,
    createdAt: at,
    updatedAt: at,
    resolvedAt: null,
    deletedAt: null,
    version: 1,
    ...overrides,
  });
};
