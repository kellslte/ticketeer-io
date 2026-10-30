import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TicketAssigned, TicketCreated, TicketDeleted, TicketStatusChanged } from '../domain/events.js';

/** The only consumer of domain events for now; notifications can subscribe the same way later. */
@Injectable()
export class TicketEventsLogger {
  private readonly logger = new Logger('TicketEvents');

  @OnEvent(TicketCreated.name)
  created(e: TicketCreated) {
    this.logger.log(`Ticket ${e.aggregateId} created by ${e.requesterId}`);
  }

  @OnEvent(TicketStatusChanged.name)
  statusChanged(e: TicketStatusChanged) {
    this.logger.log(`Ticket ${e.aggregateId} ${e.from} -> ${e.to} by ${e.actorId}`);
  }

  @OnEvent(TicketAssigned.name)
  assigned(e: TicketAssigned) {
    this.logger.log(`Ticket ${e.aggregateId} ${e.assigneeId ? `assigned to ${e.assigneeId}` : 'unassigned'} by ${e.actorId}`);
  }

  @OnEvent(TicketDeleted.name)
  deleted(e: TicketDeleted) {
    this.logger.log(`Ticket ${e.aggregateId} deleted by ${e.actorId}`);
  }
}
