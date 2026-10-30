import type { Actor } from '../domain/actor.js';
import { TicketNotFoundError } from '../domain/errors.js';
import type { Ticket } from '../domain/ticket.js';
import type { TicketRepository } from '../domain/ticket.repository.js';

/** Missing, soft-deleted and "not yours" are indistinguishable on purpose, so ticket ids can't be probed. */
export async function loadVisibleTicket(repo: TicketRepository, actor: Actor, id: string): Promise<Ticket> {
  const ticket = await repo.findById(id);
  if (!ticket || !ticket.isVisibleTo(actor)) throw new TicketNotFoundError(id);
  return ticket;
}
