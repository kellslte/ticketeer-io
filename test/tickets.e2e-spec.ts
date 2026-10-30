import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { TICKET_REPOSITORY, type TicketRepository } from '../src/modules/ticketing/domain/ticket.repository.js';
import { createApp, createUser, hasDatabase, resetDb } from './helpers.js';

type Person = Awaited<ReturnType<typeof createUser>>;
const UNKNOWN_ID = '6f1c8b5e-0000-4000-8000-000000000000';

describe.runIf(hasDatabase)('tickets API (e2e)', () => {
  let app: INestApplication;
  let alice: Person; // customer
  let bob: Person; // another customer
  let agent: Person;
  let admin: Person;

  const http = () => request(app.getHttpServer());
  const create = async (who: Person = alice, title = 'Printer is on fire') =>
    (await http().post('/api/v1/tickets').set(who.auth).send({ title, description: 'The office printer is on fire.' }).expect(201)).body.data;
  /** Moves a fresh ticket to the given status the way a real agent would. */
  const createIn = async (status: 'open' | 'in_progress' | 'resolved' | 'closed', who: Person = alice) => {
    const t = await create(who);
    const path = { open: [], in_progress: ['in_progress'], resolved: ['in_progress', 'resolved'], closed: ['closed'] }[status];
    for (const next of path) await http().patch(`/api/v1/tickets/${t.id}`).set(agent.auth).send({ status: next }).expect(200);
    return t;
  };
  const patch = (who: Person, id: string, body: object) => http().patch(`/api/v1/tickets/${id}`).set(who.auth).send(body);

  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    [alice, bob, agent, admin] = await Promise.all([
      createUser(app, 'customer'), createUser(app, 'customer'), createUser(app, 'agent'), createUser(app, 'admin'),
    ]);
  });
  afterAll(() => app.close());

  it('requires authentication on every endpoint', async () => {
    // Built lazily: supertest closes the shared server after each request.
    const calls = [
      () => http().post('/api/v1/tickets').send({}),
      () => http().get('/api/v1/tickets'),
      () => http().get(`/api/v1/tickets/${UNKNOWN_ID}`),
      () => http().patch(`/api/v1/tickets/${UNKNOWN_ID}`).send({}),
      () => http().delete(`/api/v1/tickets/${UNKNOWN_ID}`),
    ];
    for (const call of calls) {
      expect((await call().expect(401)).body.error.code).toBe('UNAUTHORIZED');
    }
  });

  describe('POST /tickets', () => {
    it('creates an open, unassigned ticket owned by the caller, trimming input', async () => {
      const res = await http().post('/api/v1/tickets').set(alice.auth).send({ title: '  Login is broken  ', description: 'I cannot log in at all.' }).expect(201);
      expect(res.body.data).toMatchObject({
        title: 'Login is broken', status: 'open', requesterId: alice.user.id, assigneeId: null, resolvedAt: null,
      });
      expect(res.body.data).toEqual(expect.objectContaining({ id: expect.any(String), createdAt: expect.any(String) }));
      expect(res.body.data).not.toHaveProperty('version');
      expect(res.body.data).not.toHaveProperty('deletedAt');
    });

    it.each(['resolved', 'open', 'closed'])('rejects a client-supplied status "%s"', async (status) => {
      const res = await http().post('/api/v1/tickets').set(alice.auth)
        .send({ title: 'Printer is on fire', description: 'The office printer is on fire.', status }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toContainEqual(expect.objectContaining({ field: 'status' }));
    });

    it.each(['requesterId', 'assigneeId', 'id', 'createdAt'])('rejects the server-owned field %s', async (field) => {
      await http().post('/api/v1/tickets').set(alice.auth)
        .send({ title: 'Printer is on fire', description: 'The office printer is on fire.', [field]: 'x' }).expect(400);
    });

    it('validates title and description with field details', async () => {
      const res = await http().post('/api/v1/tickets').set(alice.auth).send({ title: 'abc', description: 'short' }).expect(400);
      expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(expect.arrayContaining(['title', 'description']));
      await http().post('/api/v1/tickets').set(alice.auth).send({}).expect(400);
      await http().post('/api/v1/tickets').set(alice.auth).send({ title: 'x'.repeat(121), description: 'valid description' }).expect(400);
      await http().post('/api/v1/tickets').set(alice.auth).send({ title: 12345, description: 'valid description' }).expect(400);
    });

    it('lets agents raise tickets too', async () => {
      expect((await create(agent)).requesterId).toBe(agent.user.id);
    });

    it('emits a TicketCreated domain event', async () => {
      const emit = vi.spyOn(app.get(EventEmitter2), 'emit');
      const t = await create();
      expect(emit).toHaveBeenCalledWith('TicketCreated', expect.objectContaining({ aggregateId: t.id }));
      emit.mockRestore();
    });
  });

  describe('GET /tickets', () => {
    it('scopes customers to their own tickets; staff see everything', async () => {
      await create(alice, 'Alice ticket one');
      await create(alice, 'Alice ticket two');
      await create(bob, 'Bob ticket one');

      const own = await http().get('/api/v1/tickets').set(alice.auth).expect(200);
      expect(own.body.data.meta.total).toBe(2);
      expect(own.body.data.items.every((t: { requesterId: string }) => t.requesterId === alice.user.id)).toBe(true);
      expect((await http().get('/api/v1/tickets').set(agent.auth).expect(200)).body.data.meta.total).toBe(3);
      expect((await http().get('/api/v1/tickets').set(admin.auth).expect(200)).body.data.meta.total).toBe(3);
    });

    it('filters by status for each role and rejects an unknown status', async () => {
      await createIn('open');
      await createIn('in_progress');
      await createIn('in_progress', bob);

      const mine = await http().get('/api/v1/tickets?status=in_progress').set(alice.auth).expect(200);
      expect(mine.body.data.items).toHaveLength(1);
      expect(mine.body.data.items[0].status).toBe('in_progress');
      expect((await http().get('/api/v1/tickets?status=in_progress').set(agent.auth)).body.data.meta.total).toBe(2);
      expect((await http().get('/api/v1/tickets?status=open').set(agent.auth)).body.data.meta.total).toBe(1);
      expect((await http().get('/api/v1/tickets?status=closed').set(agent.auth)).body.data.items).toEqual([]);

      const bad = await http().get('/api/v1/tickets?status=banana').set(agent.auth).expect(400);
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('paginates, sorts and reports meta', async () => {
      for (const n of [1, 2, 3]) {
        await create(alice, `Ticket number ${n}`);
        await new Promise((r) => setTimeout(r, 5));
      }
      const newest = await http().get('/api/v1/tickets?limit=2').set(agent.auth).expect(200);
      expect(newest.body.data.meta).toEqual({ page: 1, limit: 2, total: 3 });
      expect(newest.body.data.items.map((t: { title: string }) => t.title)).toEqual(['Ticket number 3', 'Ticket number 2']);

      const oldestSecondPage = await http().get('/api/v1/tickets?limit=2&page=2&sort=createdAt:asc').set(agent.auth).expect(200);
      expect(oldestSecondPage.body.data.items.map((t: { title: string }) => t.title)).toEqual(['Ticket number 3']);
    });

    it.each(['page=0', 'limit=0', 'limit=101', 'page=abc', 'sort=title:asc', 'sort=createdAt'])('rejects ?%s', async (qs) => {
      await http().get(`/api/v1/tickets?${qs}`).set(agent.auth).expect(400);
    });

    it('does not list soft-deleted tickets', async () => {
      const t = await create();
      await http().delete(`/api/v1/tickets/${t.id}`).set(alice.auth).expect(204);
      expect((await http().get('/api/v1/tickets').set(agent.auth)).body.data.meta.total).toBe(0);
    });
  });

  describe('GET /tickets/:id', () => {
    it('returns the ticket to its owner and to staff', async () => {
      const t = await create();
      for (const who of [alice, agent, admin]) {
        const res = await http().get(`/api/v1/tickets/${t.id}`).set(who.auth).expect(200);
        expect(res.body.data).toMatchObject({ id: t.id, title: 'Printer is on fire' });
      }
    });

    it('answers 404, not 403, for another customer’s ticket', async () => {
      const t = await create();
      const res = await http().get(`/api/v1/tickets/${t.id}`).set(bob.auth).expect(404);
      expect(res.body.error.code).toBe('TICKET_NOT_FOUND');
    });

    it('404s unknown and soft-deleted tickets, and 400s a malformed id', async () => {
      expect((await http().get(`/api/v1/tickets/${UNKNOWN_ID}`).set(agent.auth).expect(404)).body.error.code).toBe('TICKET_NOT_FOUND');
      const t = await create();
      await http().delete(`/api/v1/tickets/${t.id}`).set(admin.auth).expect(204);
      await http().get(`/api/v1/tickets/${t.id}`).set(admin.auth).expect(404);
      expect((await http().get('/api/v1/tickets/not-a-uuid').set(agent.auth).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /tickets/:id — editing', () => {
    it('lets the owner edit title and description while open', async () => {
      const t = await create();
      const res = await patch(alice, t.id, { title: '  New title here ', description: 'A brand new description.' }).expect(200);
      expect(res.body.data).toMatchObject({ title: 'New title here', description: 'A brand new description.', status: 'open' });
      expect(new Date(res.body.data.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(t.updatedAt).getTime());
    });

    it('forbids editing once work has started', async () => {
      const t = await createIn('in_progress');
      expect((await patch(alice, t.id, { title: 'New title here' }).expect(403)).body.error.code).toBe('FORBIDDEN');
    });

    it('forbids staff from editing a customer’s wording', async () => {
      const t = await create();
      expect((await patch(agent, t.id, { title: 'Agent rewrite here' }).expect(403)).body.error.code).toBe('FORBIDDEN');
      await patch(admin, t.id, { description: 'Admin rewrite of this.' }).expect(403);
    });

    it('answers 404 when another customer tries to edit', async () => {
      const t = await create();
      await patch(bob, t.id, { title: 'Hijacked title' }).expect(404);
    });

    it('rejects edits to a closed ticket with TICKET_CLOSED', async () => {
      const t = await createIn('closed');
      const res = await patch(alice, t.id, { title: 'Too late for this' }).expect(409);
      expect(res.body.error.code).toBe('TICKET_CLOSED');
    });
  });

  describe('PATCH /tickets/:id — status', () => {
    it('never lets a customer resolve a ticket (403 from any state)', async () => {
      for (const status of ['open', 'in_progress'] as const) {
        const t = await createIn(status);
        const res = await patch(alice, t.id, { status: 'resolved' }).expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect((await http().get(`/api/v1/tickets/${t.id}`).set(alice.auth)).body.data.status).toBe(status);
      }
    });

    it('lets agents and admins walk the lifecycle, recording resolvedAt', async () => {
      const t = await create();
      expect((await patch(agent, t.id, { status: 'in_progress' }).expect(200)).body.data.status).toBe('in_progress');
      const resolved = await patch(admin, t.id, { status: 'resolved' }).expect(200);
      expect(resolved.body.data).toMatchObject({ status: 'resolved', resolvedAt: expect.any(String) });
      expect((await patch(agent, t.id, { status: 'closed' }).expect(200)).body.data.status).toBe('closed');
    });

    it('lets the owner reopen a resolved ticket (clearing resolvedAt) and close their own', async () => {
      const t = await createIn('resolved');
      const reopened = await patch(alice, t.id, { status: 'in_progress' }).expect(200);
      expect(reopened.body.data).toMatchObject({ status: 'in_progress', resolvedAt: null });
      expect((await patch(alice, t.id, { status: 'closed' }).expect(200)).body.data.status).toBe('closed');
    });

    it('forbids customers from starting work and from touching others’ tickets', async () => {
      const t = await create();
      expect((await patch(alice, t.id, { status: 'in_progress' }).expect(403)).body.error.code).toBe('FORBIDDEN');
      await patch(bob, t.id, { status: 'closed' }).expect(404);
    });

    it('rejects illegal transitions with 409 INVALID_STATUS_TRANSITION', async () => {
      const t = await create();
      const res = await patch(agent, t.id, { status: 'resolved' }).expect(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
      await patch(agent, t.id, { status: 'open' }).expect(409);
    });

    it('treats closed as terminal for everyone', async () => {
      const t = await createIn('closed');
      for (const who of [agent, admin, alice]) {
        expect((await patch(who, t.id, { status: 'in_progress' }).expect(who === alice ? 403 : 409)).body.error.code)
          .toBe(who === alice ? 'FORBIDDEN' : 'INVALID_STATUS_TRANSITION');
      }
    });

    it('fails a mixed request whole: nothing is written when one field is forbidden', async () => {
      const t = await create();
      await patch(alice, t.id, { title: 'Sneaky new title', status: 'resolved' }).expect(403);
      expect((await http().get(`/api/v1/tickets/${t.id}`).set(alice.auth)).body.data).toMatchObject({
        title: 'Printer is on fire', status: 'open',
      });
    });
  });

  describe('PATCH /tickets/:id — validation', () => {
    it('requires at least one field', async () => {
      const t = await create();
      const res = await patch(alice, t.id, {}).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['an unknown status', { status: 'banana' }],
      ['a null status', { status: null }],
      ['a null title', { title: null }],
      ['a too-short title', { title: 'abc' }],
      ['an unknown field', { priority: 'high' }],
      ['a malformed assigneeId', { assigneeId: 'not-a-uuid' }],
      ['a numeric assigneeId', { assigneeId: 42 }],
    ])('rejects %s', async (_label, body) => {
      const t = await create();
      await patch(agent, t.id, body).expect(400);
    });

    it('404s an unknown ticket and 400s a malformed id', async () => {
      await patch(agent, UNKNOWN_ID, { status: 'in_progress' }).expect(404);
      await patch(agent, 'nope', { status: 'in_progress' }).expect(400);
    });

    it('returns 409 CONCURRENT_MODIFICATION when the ticket changed between load and save', async () => {
      const t = await create();
      const repo = app.get<TicketRepository>(TICKET_REPOSITORY);
      const db = app.get<NodePgDatabase>(getDrizzleToken());
      const realSave = repo.save.bind(repo);
      const save = vi.spyOn(repo, 'save').mockImplementationOnce(async (ticket) => {
        await db.execute(sql`update tickets set version = version + 1 where id = ${t.id}`); // someone else wins the race
        return realSave(ticket);
      });

      const res = await patch(agent, t.id, { status: 'in_progress' }).expect(409);
      expect(res.body.error.code).toBe('CONCURRENT_MODIFICATION');
      expect((await http().get(`/api/v1/tickets/${t.id}`).set(agent.auth)).body.data.status).toBe('open');
      save.mockRestore();
    });
  });

  describe('PATCH /tickets/:id — assignment', () => {
    const detail = async (id: string) => (await http().get(`/api/v1/tickets/${id}`).set(admin.auth)).body.data;

    it('assigns an agent and starts work on an open ticket', async () => {
      const t = await create();
      const res = await patch(agent, t.id, { assigneeId: agent.user.id }).expect(200);
      expect(res.body.data).toMatchObject({ assigneeId: agent.user.id, status: 'in_progress' });
    });

    it('lets an admin assign, including to themselves or to another admin', async () => {
      const t = await create();
      expect((await patch(admin, t.id, { assigneeId: admin.user.id }).expect(200)).body.data.assigneeId).toBe(admin.user.id);
    });

    it('emits TicketAssigned and TicketStatusChanged when assigning an open ticket', async () => {
      const t = await create();
      const emit = vi.spyOn(app.get(EventEmitter2), 'emit');
      await patch(agent, t.id, { assigneeId: agent.user.id }).expect(200);
      const names = emit.mock.calls.map(([name]) => name);
      expect(names).toEqual(['TicketAssigned', 'TicketStatusChanged']);
      emit.mockRestore();
    });

    it.each(['in_progress', 'resolved'] as const)('keeps the status when assigning a %s ticket', async (status) => {
      const t = await createIn(status);
      const res = await patch(agent, t.id, { assigneeId: agent.user.id }).expect(200);
      expect(res.body.data.status).toBe(status);
    });

    it('reassigns to another agent and unassigns with null, without touching the status', async () => {
      const second = await createUser(app, 'agent');
      const t = await create();
      await patch(agent, t.id, { assigneeId: agent.user.id }).expect(200);
      expect((await patch(admin, t.id, { assigneeId: second.user.id }).expect(200)).body.data.assigneeId).toBe(second.user.id);
      const cleared = await patch(agent, t.id, { assigneeId: null }).expect(200);
      expect(cleared.body.data).toMatchObject({ assigneeId: null, status: 'in_progress' });
    });

    it('treats unassigning an unassigned ticket, and re-assigning the same agent, as harmless', async () => {
      const t = await create();
      expect((await patch(agent, t.id, { assigneeId: null }).expect(200)).body.data.assigneeId).toBeNull();
      await patch(agent, t.id, { assigneeId: agent.user.id }).expect(200);
      const emit = vi.spyOn(app.get(EventEmitter2), 'emit');
      await patch(agent, t.id, { assigneeId: agent.user.id }).expect(200);
      expect(emit).not.toHaveBeenCalled();
      emit.mockRestore();
    });

    it('rejects an assignee who is a customer, unknown, or not found — 422 INVALID_ASSIGNEE, ticket untouched', async () => {
      const t = await create();
      for (const assigneeId of [bob.user.id, alice.user.id, UNKNOWN_ID]) {
        const res = await patch(agent, t.id, { assigneeId }).expect(422);
        expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
      }
      expect(await detail(t.id)).toMatchObject({ assigneeId: null, status: 'open' });
    });

    it('forbids customers from assigning, even their own ticket or a non-agent target (403 beats 422)', async () => {
      const t = await create();
      for (const assigneeId of [agent.user.id, bob.user.id, null]) {
        expect((await patch(alice, t.id, { assigneeId }).expect(403)).body.error.code).toBe('FORBIDDEN');
      }
      await patch(bob, t.id, { assigneeId: agent.user.id }).expect(404);
      expect(await detail(t.id)).toMatchObject({ assigneeId: null, status: 'open' });
    });

    it('rejects assigning or unassigning a closed ticket with TICKET_CLOSED', async () => {
      const t = await createIn('closed');
      expect((await patch(agent, t.id, { assigneeId: agent.user.id }).expect(409)).body.error.code).toBe('TICKET_CLOSED');
      expect((await patch(agent, t.id, { assigneeId: null }).expect(409)).body.error.code).toBe('TICKET_CLOSED');
    });

    it('404s assigning an unknown ticket', async () => {
      await patch(agent, UNKNOWN_ID, { assigneeId: agent.user.id }).expect(404);
    });

    it('accepts { status: in_progress, assigneeId } on an open ticket as a single transition', async () => {
      const t = await create();
      const emit = vi.spyOn(app.get(EventEmitter2), 'emit');
      const res = await patch(agent, t.id, { status: 'in_progress', assigneeId: agent.user.id }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'in_progress', assigneeId: agent.user.id });
      expect(emit.mock.calls.filter(([name]) => name === 'TicketStatusChanged')).toHaveLength(1);
      emit.mockRestore();
    });

    it('is atomic: an illegal status alongside a valid assignee assigns nothing', async () => {
      const t = await create();
      await patch(agent, t.id, { status: 'resolved', assigneeId: agent.user.id }).expect(409);
      expect(await detail(t.id)).toMatchObject({ assigneeId: null, status: 'open' });
    });

    it('is atomic: a customer mixing an edit with an assignment changes nothing', async () => {
      const t = await create();
      await patch(alice, t.id, { title: 'Sneaky new title', assigneeId: agent.user.id }).expect(403);
      expect(await detail(t.id)).toMatchObject({ title: 'Printer is on fire', assigneeId: null });
    });

    it('lets the customer see who their ticket is assigned to', async () => {
      const t = await create();
      await patch(agent, t.id, { assigneeId: agent.user.id }).expect(200);
      const res = await http().get(`/api/v1/tickets/${t.id}`).set(alice.auth).expect(200);
      expect(res.body.data.assigneeId).toBe(agent.user.id);
    });
  });

  describe('GET /tickets — assignee filter', () => {
    let second: Person;
    beforeEach(async () => {
      second = await createUser(app, 'agent');
    });

    const seed = async () => {
      const mine = await create(alice, 'Assigned to the first agent');
      const theirs = await create(alice, 'Assigned to the second agent');
      const open = await create(bob, 'Not assigned to anyone');
      await patch(agent, mine.id, { assigneeId: agent.user.id }).expect(200);
      await patch(agent, theirs.id, { assigneeId: second.user.id }).expect(200);
      return { mine, theirs, open };
    };
    const ids = (res: request.Response) => res.body.data.items.map((t: { id: string }) => t.id);

    it('filters by a specific assignee', async () => {
      const { mine } = await seed();
      const res = await http().get(`/api/v1/tickets?assigneeId=${agent.user.id}`).set(admin.auth).expect(200);
      expect(ids(res)).toEqual([mine.id]);
      expect(res.body.data.meta.total).toBe(1);
    });

    it('supports assigneeId=me for the calling agent', async () => {
      const { mine, theirs } = await seed();
      expect(ids(await http().get('/api/v1/tickets?assigneeId=me').set(agent.auth).expect(200))).toEqual([mine.id]);
      expect(ids(await http().get('/api/v1/tickets?assigneeId=me').set(second.auth).expect(200))).toEqual([theirs.id]);
    });

    it('combines with the status filter', async () => {
      const { theirs } = await seed();
      await patch(agent, theirs.id, { status: 'resolved' }).expect(200);
      const resolvedForSecond = await http().get(`/api/v1/tickets?assigneeId=${second.user.id}&status=resolved`).set(admin.auth).expect(200);
      expect(ids(resolvedForSecond)).toEqual([theirs.id]);
      const openForSecond = await http().get(`/api/v1/tickets?assigneeId=${second.user.id}&status=open`).set(admin.auth).expect(200);
      expect(ids(openForSecond)).toEqual([]);
    });

    it('never widens a customer’s view: their own tickets only', async () => {
      const { mine, theirs } = await seed();
      const res = await http().get(`/api/v1/tickets?assigneeId=${agent.user.id}`).set(alice.auth).expect(200);
      expect(ids(res)).toEqual([mine.id]);
      expect(ids(await http().get(`/api/v1/tickets?assigneeId=${second.user.id}`).set(bob.auth).expect(200))).toEqual([]);
      expect(theirs.requesterId).toBe(alice.user.id);
    });

    it('returns nothing for assigneeId=me as a customer, and 400 for a malformed id', async () => {
      await seed();
      expect(ids(await http().get('/api/v1/tickets?assigneeId=me').set(alice.auth).expect(200))).toEqual([]);
      expect((await http().get('/api/v1/tickets?assigneeId=nobody').set(agent.auth).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /tickets/:id', () => {
    it('lets the owner delete an open ticket: 204, empty body, then 404', async () => {
      const t = await create();
      const res = await http().delete(`/api/v1/tickets/${t.id}`).set(alice.auth).expect(204);
      expect(res.text).toBe('');
      await http().get(`/api/v1/tickets/${t.id}`).set(alice.auth).expect(404);
      await http().delete(`/api/v1/tickets/${t.id}`).set(alice.auth).expect(404);
    });

    it('is a soft delete: the row stays, marked deleted', async () => {
      const t = await create();
      await http().delete(`/api/v1/tickets/${t.id}`).set(alice.auth).expect(204);
      const db = app.get<NodePgDatabase>(getDrizzleToken());
      const rows = await db.execute(sql`select deleted_at from tickets where id = ${t.id}`);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.deleted_at).not.toBeNull();
    });

    it('forbids the owner deleting once work has started', async () => {
      const t = await createIn('in_progress');
      expect((await http().delete(`/api/v1/tickets/${t.id}`).set(alice.auth).expect(403)).body.error.code).toBe('FORBIDDEN');
    });

    it('forbids agents, and hides the ticket from other customers (404)', async () => {
      const t = await create();
      await http().delete(`/api/v1/tickets/${t.id}`).set(agent.auth).expect(403);
      await http().delete(`/api/v1/tickets/${t.id}`).set(bob.auth).expect(404);
      await http().get(`/api/v1/tickets/${t.id}`).set(alice.auth).expect(200);
    });

    it('lets an admin delete a ticket in any status', async () => {
      for (const status of ['open', 'in_progress', 'resolved', 'closed'] as const) {
        const t = await createIn(status);
        await http().delete(`/api/v1/tickets/${t.id}`).set(admin.auth).expect(204);
      }
    });

    it('404s an unknown ticket and 400s a malformed id', async () => {
      await http().delete(`/api/v1/tickets/${UNKNOWN_ID}`).set(admin.auth).expect(404);
      await http().delete('/api/v1/tickets/nope').set(admin.auth).expect(400);
    });
  });
});
