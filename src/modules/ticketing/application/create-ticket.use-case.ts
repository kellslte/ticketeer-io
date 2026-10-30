import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import type { Actor } from '../domain/actor.js';
import { Ticket } from '../domain/ticket.js';
import { TICKET_REPOSITORY, type TicketRepository } from '../domain/ticket.repository.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import { publishEvents } from './publish-events.js';
import { toTicketResponse } from './ticket-response.js';

@Injectable()
export class CreateTicketUseCase {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(actor: Actor, dto: CreateTicketDto) {
    const ticket = Ticket.create({ id: randomUUID(), title: dto.title, description: dto.description }, actor);
    await this.tickets.save(ticket);
    publishEvents(this.events, ticket);
    return toTicketResponse(ticket);
  }
}
