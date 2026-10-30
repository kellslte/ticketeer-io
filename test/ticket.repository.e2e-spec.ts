import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AGENT_DIRECTORY, type AgentDirectory } from '../src/modules/ticketing/domain/agent-directory.js';
import type { Actor } from '../src/modules/ticketing/domain/actor.js';
import { ConcurrentModificationError } from '../src/modules/ticketing/domain/errors.js';
import { Ticket } from '../src/modules/ticketing/domain/ticket.js';
import { TICKET_REPOSITORY, type TicketRepository } from '../src/modules/ticketing/domain/ticket.repository.js';
import { createApp, createUser, hasDatabase, resetDb } from './helpers.js';

describe.runIf(hasDatabase)('ticket persistence (e2e)', () => {
  let app: INestApplication;
  let repo: TicketRepository;
  let customer: Actor;
  let agent: Actor;
  let admin: Actor;

  const newTicket = (actor: Actor = customer, title = 'Printer is on fire') =>
    Ticket.create({ id: randomUUID(), title, description: 'The office printer is on fire.' }, actor);

  const saved = async (actor?: Actor, title?: string) => {
    const t = newTicket(actor, title);
    await repo.save(t);
    return t;
  };

  beforeAll(async () => {
    app = await createApp();
    repo = app.get<TicketRepository>(TICKET_REPOSITORY);
  });
  beforeEach(async () => {
    await resetDb(app);
    customer = (await createUser(app, 'customer')).user;
    agent = (await createUser(app, 'agent')).user;
    admin = (await createUser(app, 'admin')).user;
  });
  afterAll(() => app.close());

  it('round-trips a new ticket (version starts at 1)', async () => {
    const t = await saved();
    const loaded = await repo.findById(t.id);
    expect(loaded).toMatchObject({
      id: t.id, title: 'Printer is on fire', status: 'open', requesterId: customer.id,
      assigneeId: null, resolvedAt: null, deletedAt: null, version: 1,
    });
    expect(loaded?.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for an unknown id', async () => {
    expect(await repo.findById(randomUUID())).toBeNull();
  });

  it('persists changes and bumps the version each save', async () => {
    const t = await saved();
    const first = (await repo.findById(t.id))!;
    first.assign(agent, agent.id);
    first.changeStatus(agent, 'resolved');
    await repo.save(first);

    const second = (await repo.findById(t.id))!;
    expect(second).toMatchObject({ status: 'resolved', assigneeId: agent.id, version: 2 });
    expect(second.resolvedAt).toBeInstanceOf(Date);
  });

  it('rejects a stale write with ConcurrentModificationError (optimistic lock)', async () => {
    const t = await saved();
    const a = (await repo.findById(t.id))!;
    const b = (await repo.findById(t.id))!;
    a.changeStatus(agent, 'in_progress');
    b.changeStatus(agent, 'closed');
    await repo.save(a);
    await expect(repo.save(b)).rejects.toThrow(ConcurrentModificationError);
    expect((await repo.findById(t.id))?.status).toBe('in_progress');
  });

  it('hides soft-deleted tickets from findById and search', async () => {
    const t = await saved();
    await saved(customer, 'Another ticket');
    const loaded = (await repo.findById(t.id))!;
    loaded.softDelete(admin);
    await repo.save(loaded);

    expect(await repo.findById(t.id)).toBeNull();
    const { items, total } = await repo.search({ page: 1, limit: 10, sort: 'desc' });
    expect(total).toBe(1);
    expect(items.map((i) => i.title)).toEqual(['Another ticket']);
  });

  it('refuses a ticket whose requester does not exist (foreign key)', async () => {
    await expect(repo.save(newTicket({ id: randomUUID(), role: 'customer' }))).rejects.toThrow();
  });

  describe('search', () => {
    it('filters by status, assignee and requester, with a matching total', async () => {
      const other = (await createUser(app, 'customer')).user;
      const mine = await saved(customer, 'Mine, still open');
      const progressing = await saved(customer, 'Mine, in progress');
      await saved(other, 'Someone else');

      const t = (await repo.findById(progressing.id))!;
      t.assign(agent, agent.id);
      await repo.save(t);

      const base = { page: 1, limit: 10, sort: 'asc' } as const;
      const open = await repo.search({ ...base, status: 'open' });
      expect(open.total).toBe(2);

      const assigned = await repo.search({ ...base, assigneeId: agent.id });
      expect(assigned.items.map((i) => i.id)).toEqual([progressing.id]);

      const own = await repo.search({ ...base, requesterId: customer.id });
      expect(own.items.map((i) => i.id).sort()).toEqual([mine.id, progressing.id].sort());

      const combined = await repo.search({ ...base, requesterId: customer.id, status: 'open' });
      expect(combined.items.map((i) => i.id)).toEqual([mine.id]);
    });

    it('paginates and sorts by createdAt, reporting the full total', async () => {
      for (const n of [1, 2, 3, 4, 5]) {
        await saved(customer, `Ticket number ${n}`);
        await new Promise((r) => setTimeout(r, 5)); // distinct createdAt
      }
      const page1 = await repo.search({ page: 1, limit: 2, sort: 'asc' });
      const page3 = await repo.search({ page: 3, limit: 2, sort: 'asc' });
      expect(page1.total).toBe(5);
      expect(page1.items.map((i) => i.title)).toEqual(['Ticket number 1', 'Ticket number 2']);
      expect(page3.items.map((i) => i.title)).toEqual(['Ticket number 5']);

      const newestFirst = await repo.search({ page: 1, limit: 1, sort: 'desc' });
      expect(newestFirst.items[0]?.title).toBe('Ticket number 5');
    });

    it('returns an empty page with total 0', async () => {
      expect(await repo.search({ page: 1, limit: 10, sort: 'desc' })).toEqual({ items: [], total: 0 });
    });
  });

  describe('AgentDirectory (Identity adapter)', () => {
    it('accepts agents and admins only; unknown and malformed ids are not agents', async () => {
      const directory = app.get<AgentDirectory>(AGENT_DIRECTORY);
      expect(await directory.isAgent(agent.id)).toBe(true);
      expect(await directory.isAgent(admin.id)).toBe(true);
      expect(await directory.isAgent(customer.id)).toBe(false);
      expect(await directory.isAgent(randomUUID())).toBe(false);
      expect(await directory.isAgent('not-a-uuid')).toBe(false);
    });
  });
});
