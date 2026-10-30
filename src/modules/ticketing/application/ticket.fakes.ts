import type { Ticket } from '../domain/ticket.js';
import type { TicketRepository, TicketSearch } from '../domain/ticket.repository.js';

export class InMemoryTicketRepository implements TicketRepository {
  readonly items = new Map<string, Ticket>();
  lastSearch?: TicketSearch;

  async findById(id: string) {
    const t = this.items.get(id);
    return t && !t.deletedAt ? t : null;
  }

  async search(criteria: TicketSearch) {
    this.lastSearch = criteria;
    const matches = [...this.items.values()]
      .filter((t) => !t.deletedAt)
      .filter((t) => !criteria.status || t.status === criteria.status)
      .filter((t) => !criteria.requesterId || t.requesterId === criteria.requesterId);
    const start = (criteria.page - 1) * criteria.limit;
    return { items: matches.slice(start, start + criteria.limit), total: matches.length };
  }

  async save(ticket: Ticket) {
    this.items.set(ticket.id, ticket);
  }
}
