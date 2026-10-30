import type { Actor } from './actor.js';
import type { AgentDirectory } from './agent-directory.js';
import { InvalidAssigneeError } from './errors.js';
import type { Ticket } from './ticket.js';

/**
 * Domain service: assigning needs a fact the aggregate can't know (is the
 * assignee an agent?), so the directory lookup lives here, after the cheap
 * permission check and before the mutation.
 */
export class TicketAssigner {
  constructor(private readonly agents: AgentDirectory) {}

  async assign(ticket: Ticket, actor: Actor, assigneeId: string): Promise<void> {
    ticket.assertCanAssign(actor); // 403 / TICKET_CLOSED win over 422
    if (!(await this.agents.isAgent(assigneeId))) throw new InvalidAssigneeError();
    ticket.assign(actor, assigneeId);
  }
}
