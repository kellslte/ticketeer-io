import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Actor } from '../domain/actor.js';
import { TICKET_REPOSITORY, type TicketRepository } from '../domain/ticket.repository.js';
import type { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { loadVisibleTicket } from './load-visible-ticket.js';
import { publishEvents } from './publish-events.js';
import { toTicketResponse } from './ticket-response.js';

@Injectable()
export class UpdateTicketUseCase {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(actor: Actor, id: string, dto: UpdateTicketDto) {
    const { title, description, status } = dto;
    if (title === undefined && description === undefined && status === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Provide at least one of: title, description, status',
      });
    }

    const ticket = await loadVisibleTicket(this.tickets, actor, id);
    // Every change is applied to the in-memory aggregate first and saved once, so a request
    // mixing allowed and forbidden fields fails whole with nothing written.
    // Edit before status: editing is only allowed while `open`, so the order matters.
    if (title !== undefined || description !== undefined) ticket.edit(actor, { title, description });
    if (status !== undefined) ticket.changeStatus(actor, status);

    await this.tickets.save(ticket);
    publishEvents(this.events, ticket);
    return toTicketResponse(ticket);
  }
}
