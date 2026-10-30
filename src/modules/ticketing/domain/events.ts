import { DomainEvent } from '../../../shared/domain/domain-event.js';
import type { TicketStatus } from './ticket-status.js';

export class TicketCreated extends DomainEvent {
  constructor(
    ticketId: string,
    readonly requesterId: string,
  ) {
    super(ticketId);
  }
}

export class TicketStatusChanged extends DomainEvent {
  constructor(
    ticketId: string,
    readonly from: TicketStatus,
    readonly to: TicketStatus,
    readonly actorId: string,
  ) {
    super(ticketId);
  }
}

export class TicketAssigned extends DomainEvent {
  constructor(
    ticketId: string,
    /** null when the ticket was unassigned */
    readonly assigneeId: string | null,
    readonly actorId: string,
  ) {
    super(ticketId);
  }
}

export class TicketDeleted extends DomainEvent {
  constructor(
    ticketId: string,
    readonly actorId: string,
  ) {
    super(ticketId);
  }
}
