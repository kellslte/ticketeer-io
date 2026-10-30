import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../domain/actor.js';
import { TICKET_REPOSITORY, type TicketRepository } from '../domain/ticket.repository.js';
import { loadVisibleTicket } from './load-visible-ticket.js';
import { toTicketResponse } from './ticket-response.js';

@Injectable()
export class GetTicketUseCase {
  constructor(@Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository) {}

  async execute(actor: Actor, id: string) {
    return toTicketResponse(await loadVisibleTicket(this.tickets, actor, id));
  }
}
