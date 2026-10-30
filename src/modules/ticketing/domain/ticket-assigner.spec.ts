import { ActorNotAllowedError, InvalidAssigneeError, TicketClosedError } from './errors.js';
import { agent, customer, makeTicket } from './ticket.fixtures.js';
import { TicketAssigner } from './ticket-assigner.js';

const directory = (agents: string[]) => ({ isAgent: vi.fn(async (id: string) => agents.includes(id)) });

describe('TicketAssigner', () => {
  it('assigns a known agent and starts work on an open ticket', async () => {
    const t = makeTicket();
    await new TicketAssigner(directory(['agent-2'])).assign(t, agent, 'agent-2');
    expect(t).toMatchObject({ assigneeId: 'agent-2', status: 'in_progress' });
  });

  it('rejects an assignee who is not an agent, leaving the ticket untouched', async () => {
    const t = makeTicket();
    await expect(new TicketAssigner(directory([])).assign(t, agent, 'cust-9')).rejects.toThrow(InvalidAssigneeError);
    expect(t).toMatchObject({ assigneeId: null, status: 'open' });
  });

  it('checks permission before asking the directory (403 beats 422)', async () => {
    const dir = directory([]);
    await expect(new TicketAssigner(dir).assign(makeTicket(), customer, 'nobody')).rejects.toThrow(ActorNotAllowedError);
    await expect(new TicketAssigner(dir).assign(makeTicket({ status: 'closed' }), agent, 'nobody')).rejects.toThrow(TicketClosedError);
    expect(dir.isAgent).not.toHaveBeenCalled();
  });
});
