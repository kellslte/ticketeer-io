import { DomainError } from '../../../shared/domain/domain-error.js';
import type { TicketStatus } from './ticket-status.js';

export class TicketNotFoundError extends DomainError {
  readonly code = 'TICKET_NOT_FOUND';
  constructor(id?: string) {
    super(id ? `Ticket ${id} not found` : 'Ticket not found');
  }
}

export class InvalidStatusTransitionError extends DomainError {
  readonly code = 'INVALID_STATUS_TRANSITION';
  constructor(from: TicketStatus, to: TicketStatus) {
    super(`Cannot change ticket status from "${from}" to "${to}"`);
  }
}

export class TicketClosedError extends DomainError {
  readonly code = 'TICKET_CLOSED';
  constructor() {
    super('Ticket is closed and can no longer be changed');
  }
}

export class ActorNotAllowedError extends DomainError {
  readonly code = 'FORBIDDEN';
  constructor(message = 'You are not allowed to perform this action') {
    super(message);
  }
}

export class InvalidAssigneeError extends DomainError {
  readonly code = 'INVALID_ASSIGNEE';
  constructor() {
    super('Assignee must be an existing support agent');
  }
}

export class ConcurrentModificationError extends DomainError {
  readonly code = 'CONCURRENT_MODIFICATION';
  constructor() {
    super('Ticket was modified by someone else; reload and try again');
  }
}

export class InvalidTicketFieldError extends DomainError {
  readonly code = 'INVALID_TICKET_FIELD';
}
