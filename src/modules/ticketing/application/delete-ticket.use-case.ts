import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Actor } from '../domain/actor.js';
import { TICKET_REPOSITORY, type TicketRepository } from '../domain/ticket.repository.js';
import { loadVisibleTicket } from './load-visible-ticket.js';
import { publishEvents } from './publish-events.js';

@Injectable()
export class DeleteTicketUseCase {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(actor: Actor, id: string): Promise<void> {
    const ticket = await loadVisibleTicket(this.tickets, actor, id);
    ticket.softDelete(actor);
    await this.tickets.save(ticket);
    publishEvents(this.events, ticket);
  }
}
