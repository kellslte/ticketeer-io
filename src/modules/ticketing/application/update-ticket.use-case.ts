import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Actor } from '../domain/actor.js';
import { AGENT_DIRECTORY, type AgentDirectory } from '../domain/agent-directory.js';
import { TicketAssigner } from '../domain/ticket-assigner.js';
import { TICKET_REPOSITORY, type TicketRepository } from '../domain/ticket.repository.js';
import type { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { loadVisibleTicket } from './load-visible-ticket.js';
import { publishEvents } from './publish-events.js';
import { toTicketResponse } from './ticket-response.js';

@Injectable()
export class UpdateTicketUseCase {
  private readonly assigner: TicketAssigner;

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    private readonly events: EventEmitter2,
    @Inject(AGENT_DIRECTORY) agents: AgentDirectory,
  ) {
    this.assigner = new TicketAssigner(agents);
  }

  async execute(actor: Actor, id: string, dto: UpdateTicketDto) {
    const { title, description, status, assigneeId } = dto;
    if ([title, description, status, assigneeId].every((field) => field === undefined)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Provide at least one of: title, description, status, assigneeId',
      });
    }

    const ticket = await loadVisibleTicket(this.tickets, actor, id);
    // Every change is applied to the in-memory aggregate first and saved once, so a request
    // mixing allowed and forbidden fields fails whole with nothing written.
    // Order matters. Edit first (only allowed while `open`). Status before assignment, so
    // { status: 'in_progress', assigneeId } on an open ticket is one transition: assigning an
    // open ticket would otherwise move it to in_progress by itself and the explicit status
    // would then be a second, illegal in_progress -> in_progress.
    if (title !== undefined || description !== undefined) ticket.edit(actor, { title, description });
    if (status !== undefined) ticket.changeStatus(actor, status);
    if (assigneeId === null) ticket.unassign(actor);
    else if (assigneeId !== undefined) await this.assigner.assign(ticket, actor, assigneeId);

    await this.tickets.save(ticket);
    publishEvents(this.events, ticket);
    return toTicketResponse(ticket);
  }
}
