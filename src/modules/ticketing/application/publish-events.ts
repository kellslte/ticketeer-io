import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Ticket } from '../domain/ticket.js';

/** Call only after the ticket has been saved. Listeners must not throw: the write has already happened. */
export function publishEvents(emitter: EventEmitter2, ticket: Ticket): void {
  for (const event of ticket.pullEvents()) emitter.emit(event.constructor.name, event);
}
