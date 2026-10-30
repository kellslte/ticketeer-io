import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActorNotAllowedError, TicketNotFoundError } from '../domain/errors.js';
import { admin, agent, customer, otherCustomer } from '../domain/ticket.fixtures.js';
import { CreateTicketUseCase } from './create-ticket.use-case.js';
import { DeleteTicketUseCase } from './delete-ticket.use-case.js';
import { GetTicketUseCase } from './get-ticket.use-case.js';
import { ListTicketsUseCase } from './list-tickets.use-case.js';
import { InMemoryTicketRepository } from './ticket.fakes.js';
import { UpdateTicketUseCase } from './update-ticket.use-case.js';

const input = { title: 'Printer is on fire', description: 'The office printer is on fire.' };

describe('ticket use-cases', () => {
  let repo: InMemoryTicketRepository;
  let events: EventEmitter2;
  let create: CreateTicketUseCase;
  let update: UpdateTicketUseCase;

  beforeEach(() => {
    repo = new InMemoryTicketRepository();
    events = new EventEmitter2();
    create = new CreateTicketUseCase(repo, events);
    update = new UpdateTicketUseCase(repo, events);
  });

  describe('create', () => {
    it('saves an open ticket for the caller and publishes TicketCreated once', async () => {
      const emit = vi.spyOn(events, 'emit');
      const result = await create.execute(customer, input);
      expect(result).toMatchObject({ status: 'open', requesterId: customer.id, assigneeId: null });
      expect(repo.items.has(result.id)).toBe(true);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('TicketCreated', expect.objectContaining({ aggregateId: result.id }));
    });
  });

  describe('get', () => {
    it('shows a ticket to its owner and staff, but 404s everyone else', async () => {
      const { id } = await create.execute(customer, input);
      const get = new GetTicketUseCase(repo);
      for (const who of [customer, agent, admin]) expect(await get.execute(who, id)).toMatchObject({ id });
      await expect(get.execute(otherCustomer, id)).rejects.toThrow(TicketNotFoundError);
      await expect(get.execute(agent, 'missing')).rejects.toThrow(TicketNotFoundError);
    });
  });

  describe('list', () => {
    it('scopes customers to themselves, leaves staff unscoped, and maps sort and paging', async () => {
      await create.execute(customer, input);
      await create.execute(otherCustomer, input);
      const list = new ListTicketsUseCase(repo);
      const query = { page: 2, limit: 5, sort: 'createdAt:asc' as const };

      const mine = await list.execute(customer, { ...query, page: 1 });
      expect(mine.meta).toEqual({ page: 1, limit: 5, total: 1 });
      expect(repo.lastSearch).toMatchObject({ requesterId: customer.id, sort: 'asc' });

      await list.execute(agent, { ...query, status: 'open', sort: 'createdAt:desc' });
      expect(repo.lastSearch).toMatchObject({ requesterId: undefined, status: 'open', sort: 'desc', page: 2 });
    });
  });

  describe('update', () => {
    it('applies an edit and a status change in one save', async () => {
      const { id } = await create.execute(customer, input);
      const result = await update.execute(customer, id, { title: 'A better title here', status: 'closed' });
      expect(result).toMatchObject({ title: 'A better title here', status: 'closed' });
    });

    it('is atomic: a forbidden field means nothing is saved or published', async () => {
      const { id } = await create.execute(customer, input);
      const emit = vi.spyOn(events, 'emit');
      const save = vi.spyOn(repo, 'save');

      await expect(update.execute(customer, id, { title: 'Sneaky new title', status: 'resolved' })).rejects.toThrow(ActorNotAllowedError);
      expect(save).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('rejects an empty update', async () => {
      const { id } = await create.execute(customer, input);
      await expect(update.execute(customer, id, {})).rejects.toThrow(/at least one/i);
    });

    it('hides other customers’ tickets and publishes the status event', async () => {
      const { id } = await create.execute(customer, input);
      await expect(update.execute(otherCustomer, id, { status: 'closed' })).rejects.toThrow(TicketNotFoundError);
      const emit = vi.spyOn(events, 'emit');
      await update.execute(agent, id, { status: 'in_progress' });
      expect(emit).toHaveBeenCalledWith('TicketStatusChanged', expect.objectContaining({ from: 'open', to: 'in_progress' }));
    });
  });

  describe('delete', () => {
    it('soft-deletes for the owner and publishes TicketDeleted', async () => {
      const { id } = await create.execute(customer, input);
      const emit = vi.spyOn(events, 'emit');
      await new DeleteTicketUseCase(repo, events).execute(customer, id);
      expect(await repo.findById(id)).toBeNull();
      expect(emit).toHaveBeenCalledWith('TicketDeleted', expect.objectContaining({ aggregateId: id }));
    });

    it('forbids an agent, hides from other customers', async () => {
      const { id } = await create.execute(customer, input);
      const remove = new DeleteTicketUseCase(repo, events);
      await expect(remove.execute(agent, id)).rejects.toThrow(ActorNotAllowedError);
      await expect(remove.execute(otherCustomer, id)).rejects.toThrow(TicketNotFoundError);
      expect(await repo.findById(id)).not.toBeNull();
    });
  });
});
