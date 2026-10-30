import { Inject, Injectable } from '@nestjs/common';
import { isStaff, type Actor } from '../domain/actor.js';
import { TICKET_REPOSITORY, type TicketRepository } from '../domain/ticket.repository.js';
import type { ListTicketsQueryDto } from './dto/list-tickets-query.dto.js';
import { toTicketResponse } from './ticket-response.js';

@Injectable()
export class ListTicketsUseCase {
  constructor(@Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository) {}

  async execute(actor: Actor, query: ListTicketsQueryDto) {
    const { items, total } = await this.tickets.search({
      status: query.status,
      assigneeId: query.assigneeId === 'me' ? actor.id : query.assigneeId,
      // Scoping lives here, not in the controller, so no caller can forget it.
      requesterId: isStaff(actor) ? undefined : actor.id,
      page: query.page,
      limit: query.limit,
      sort: query.sort === 'createdAt:asc' ? 'asc' : 'desc',
    });
    return { items: items.map(toTicketResponse), meta: { page: query.page, limit: query.limit, total } };
  }
}
