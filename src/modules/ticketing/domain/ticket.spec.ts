import { ActorNotAllowedError, InvalidStatusTransitionError, InvalidTicketFieldError, TicketClosedError } from './errors.js';
import { TicketAssigned, TicketCreated, TicketDeleted, TicketStatusChanged } from './events.js';
import { Ticket } from './ticket.js';
import { TicketStatus } from './ticket-status.js';
import { admin, agent, customer, makeTicket, otherCustomer } from './ticket.fixtures.js';

const ALL = Object.values(TicketStatus);

describe('Ticket.create', () => {
  const input = { id: 't-1', title: '  Printer is on fire  ', description: 'The office printer is on fire.' };

  it('starts open, unassigned, owned by the actor, with one TicketCreated event', () => {
    const t = Ticket.create(input, customer);
    expect(t).toMatchObject({ status: 'open', assigneeId: null, requesterId: customer.id, resolvedAt: null, version: 0 });
    expect(t.title).toBe('Printer is on fire');
    expect(t.pullEvents()).toEqual([expect.any(TicketCreated)]);
  });

  it.each([
    ['short title', { title: 'abcd' }],
    ['blank title', { title: '     ' }],
    ['long title', { title: 'x'.repeat(121) }],
    ['short description', { description: 'too short' }],
    ['long description', { description: 'x'.repeat(5001) }],
  ])('rejects %s', (_label, override) => {
    expect(() => Ticket.create({ ...input, ...override }, customer)).toThrow(InvalidTicketFieldError);
  });
});

describe('Ticket.changeStatus', () => {
  const staffValid: [TicketStatus, TicketStatus][] = [
    ['open', 'in_progress'], ['open', 'closed'], ['in_progress', 'resolved'],
    ['in_progress', 'closed'], ['resolved', 'in_progress'], ['resolved', 'closed'],
  ];
  const isValid = (f: TicketStatus, t: TicketStatus) => staffValid.some(([a, b]) => a === f && b === t);

  describe.each([['agent', agent], ['admin', admin]])('as %s', (_n, actor) => {
    it.each(staffValid)('%s -> %s is allowed and emits one event', (from, to) => {
      const t = makeTicket({ status: from });
      t.changeStatus(actor, to);
      expect(t.status).toBe(to);
      expect(t.pullEvents()).toEqual([expect.objectContaining({ from, to, actorId: actor.id })]);
    });

    const invalid = ALL.flatMap((f) => ALL.filter((t) => !isValid(f, t)).map((t) => [f, t] as const));
    it.each(invalid)('%s -> %s is an invalid transition', (from, to) => {
      expect(() => makeTicket({ status: from }).changeStatus(actor, to)).toThrow(InvalidStatusTransitionError);
    });
  });

  describe('as the requesting customer', () => {
    const allowed: [TicketStatus, TicketStatus][] = [
      ['open', 'closed'], ['in_progress', 'closed'], ['resolved', 'closed'], ['resolved', 'in_progress'],
    ];
    it.each(allowed)('%s -> %s is allowed', (from, to) => {
      const t = makeTicket({ status: from });
      t.changeStatus(customer, to);
      expect(t.status).toBe(to);
    });

    it.each(['open', 'in_progress', 'resolved'] as const)('can never resolve (from %s) -> forbidden, not a conflict', (from) => {
      expect(() => makeTicket({ status: from }).changeStatus(customer, 'resolved')).toThrow(ActorNotAllowedError);
    });

    it.each([['open', 'in_progress'], ['in_progress', 'in_progress'], ['in_progress', 'open'], ['resolved', 'open']] as const)(
      '%s -> %s is forbidden',
      (from, to) => {
        expect(() => makeTicket({ status: from }).changeStatus(customer, to)).toThrow(ActorNotAllowedError);
      },
    );

    it('cannot touch a closed ticket (terminal)', () => {
      expect(() => makeTicket({ status: 'closed' }).changeStatus(customer, 'closed')).toThrow(InvalidStatusTransitionError);
    });
  });

  it('forbids a customer who is not the requester from any change', () => {
    expect(() => makeTicket().changeStatus(otherCustomer, 'closed')).toThrow(ActorNotAllowedError);
  });

  it('sets resolvedAt on resolve, keeps it on close, clears it on reopen', () => {
    const t = makeTicket({ status: 'in_progress' });
    t.changeStatus(agent, 'resolved');
    expect(t.resolvedAt).toBeInstanceOf(Date);
    t.changeStatus(customer, 'in_progress');
    expect(t.resolvedAt).toBeNull();
    t.changeStatus(agent, 'resolved');
    t.changeStatus(agent, 'closed');
    expect(t.resolvedAt).toBeInstanceOf(Date);
  });

  it('does not mutate on failure', () => {
    const t = makeTicket();
    expect(() => t.changeStatus(customer, 'resolved')).toThrow();
    expect(t.status).toBe('open');
    expect(t.pullEvents()).toEqual([]);
  });
});

describe('Ticket.edit', () => {
  it('lets the requesting customer edit while open, trimming input', () => {
    const t = makeTicket();
    t.edit(customer, { title: '  New title here ' });
    expect(t.title).toBe('New title here');
    expect(t.description).toBe('The office printer is visibly on fire.');
  });

  it.each([['agent', agent], ['admin', admin], ['another customer', otherCustomer]])('forbids %s', (_n, actor) => {
    expect(() => makeTicket().edit(actor, { title: 'New title here' })).toThrow(ActorNotAllowedError);
  });

  it.each(['in_progress', 'resolved'] as const)('forbids editing while %s', (status) => {
    expect(() => makeTicket({ status }).edit(customer, { title: 'New title here' })).toThrow(ActorNotAllowedError);
  });

  it('rejects edits on a closed ticket with TICKET_CLOSED', () => {
    expect(() => makeTicket({ status: 'closed' }).edit(customer, { title: 'New title here' })).toThrow(TicketClosedError);
  });

  it('validates edited fields', () => {
    expect(() => makeTicket().edit(customer, { title: 'abc' })).toThrow(InvalidTicketFieldError);
  });
});

describe('Ticket.assign / unassign', () => {
  it('moves an open ticket to in_progress and emits both events', () => {
    const t = makeTicket();
    t.assign(agent, 'agent-2');
    expect(t).toMatchObject({ assigneeId: 'agent-2', status: 'in_progress' });
    const events = t.pullEvents();
    expect(events).toEqual([expect.any(TicketAssigned), expect.any(TicketStatusChanged)]);
    expect(events[1]).toMatchObject({ from: 'open', to: 'in_progress', actorId: agent.id });
  });

  it.each(['in_progress', 'resolved'] as const)('keeps status when assigning a %s ticket', (status) => {
    const t = makeTicket({ status });
    t.assign(admin, 'agent-2');
    expect(t.status).toBe(status);
    expect(t.pullEvents()).toEqual([expect.any(TicketAssigned)]);
  });

  it('rejects assigning a closed ticket', () => {
    expect(() => makeTicket({ status: 'closed' }).assign(agent, 'agent-2')).toThrow(TicketClosedError);
  });

  it.each([['customer', customer], ['another customer', otherCustomer]])('forbids %s from assigning', (_n, actor) => {
    expect(() => makeTicket().assign(actor, 'agent-2')).toThrow(ActorNotAllowedError);
  });

  it('is a no-op (no events) when the assignee is unchanged', () => {
    const t = makeTicket({ status: 'in_progress', assigneeId: 'agent-2' });
    t.assign(agent, 'agent-2');
    expect(t.pullEvents()).toEqual([]);
  });

  it('unassign clears the assignee without changing status', () => {
    const t = makeTicket({ status: 'in_progress', assigneeId: 'agent-2' });
    t.unassign(agent);
    expect(t).toMatchObject({ assigneeId: null, status: 'in_progress' });
    expect(t.pullEvents()).toEqual([expect.objectContaining({ assigneeId: null })]);
  });

  it('unassign on an unassigned ticket is a no-op; customers cannot unassign; closed rejects', () => {
    const unassigned = makeTicket();
    unassigned.unassign(agent);
    expect(unassigned.pullEvents()).toEqual([]);
    expect(() => makeTicket({ assigneeId: 'a' }).unassign(customer)).toThrow(ActorNotAllowedError);
    expect(() => makeTicket({ status: 'closed', assigneeId: 'a' }).unassign(agent)).toThrow(TicketClosedError);
  });
});

describe('Ticket.softDelete', () => {
  it('lets the requester delete while open', () => {
    const t = makeTicket();
    t.softDelete(customer);
    expect(t.deletedAt).toBeInstanceOf(Date);
    expect(t.pullEvents()).toEqual([expect.any(TicketDeleted)]);
  });

  it.each(ALL.filter((s) => s !== 'open'))('forbids the requester deleting a %s ticket', (status) => {
    expect(() => makeTicket({ status }).softDelete(customer)).toThrow(ActorNotAllowedError);
  });

  it('forbids other customers and agents', () => {
    expect(() => makeTicket().softDelete(otherCustomer)).toThrow(ActorNotAllowedError);
    expect(() => makeTicket().softDelete(agent)).toThrow(ActorNotAllowedError);
  });

  it.each(ALL)('lets an admin delete a %s ticket', (status) => {
    const t = makeTicket({ status });
    t.softDelete(admin);
    expect(t.deletedAt).not.toBeNull();
  });
});

describe('Ticket.isVisibleTo', () => {
  it('shows customers only their own tickets and staff everything', () => {
    const t = makeTicket();
    expect(t.isVisibleTo(customer)).toBe(true);
    expect(t.isVisibleTo(otherCustomer)).toBe(false);
    expect(t.isVisibleTo(agent)).toBe(true);
    expect(t.isVisibleTo(admin)).toBe(true);
  });

  it('hides soft-deleted tickets from everyone', () => {
    const t = makeTicket({ deletedAt: new Date() });
    expect([customer, agent, admin].some((a) => t.isVisibleTo(a))).toBe(false);
  });
});
