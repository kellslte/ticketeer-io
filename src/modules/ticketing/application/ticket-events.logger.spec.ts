import { Logger } from '@nestjs/common';
import { TicketAssigned, TicketCreated, TicketDeleted, TicketStatusChanged } from '../domain/events.js';
import { TicketEventsLogger } from './ticket-events.logger.js';

describe('TicketEventsLogger', () => {
  it('logs one line per domain event, naming who did what', () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const listener = new TicketEventsLogger();

    listener.created(new TicketCreated('t1', 'u1'));
    listener.statusChanged(new TicketStatusChanged('t1', 'open', 'in_progress', 'a1'));
    listener.assigned(new TicketAssigned('t1', 'a2', 'a1'));
    listener.assigned(new TicketAssigned('t1', null, 'a1'));
    listener.deleted(new TicketDeleted('t1', 'u1'));

    expect(log.mock.calls.map(([line]) => line)).toEqual([
      'Ticket t1 created by u1',
      'Ticket t1 open -> in_progress by a1',
      'Ticket t1 assigned to a2 by a1',
      'Ticket t1 unassigned by a1',
      'Ticket t1 deleted by u1',
    ]);
    log.mockRestore();
  });
});
