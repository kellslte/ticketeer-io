import type { Ticket } from './ticket.js';
import type { TicketStatus } from './ticket-status.js';

export const TICKET_REPOSITORY = Symbol('TICKET_REPOSITORY');

export interface TicketSearch {
  status?: TicketStatus;
  assigneeId?: string;
  /** Set for customers so they only ever see their own tickets. */
  requesterId?: string;
  page: number;
  limit: number;
  /** by createdAt */
  sort: 'asc' | 'desc';
}

export interface TicketRepository {
  /** Never returns soft-deleted tickets. */
  findById(id: string): Promise<Ticket | null>;
  search(criteria: TicketSearch): Promise<{ items: Ticket[]; total: number }>;
  /** Insert or update (including soft delete). Throws ConcurrentModificationError on a stale version. */
  save(ticket: Ticket): Promise<void>;
}
