import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { ActorRole, isStaff, type Actor } from './actor.js';
import {
  ActorNotAllowedError,
  InvalidStatusTransitionError,
  TicketClosedError,
} from './errors.js';
import { TicketAssigned, TicketCreated, TicketDeleted, TicketStatusChanged } from './events.js';
import { parseDescription, parseTitle } from './ticket-fields.js';
import { canTransition, TicketStatus } from './ticket-status.js';

export interface TicketProps {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  requesterId: string;
  assigneeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  deletedAt: Date | null;
  /** Loaded row version; the repository bumps it on save (optimistic lock). */
  version: number;
}

export class Ticket extends AggregateRoot {
  private constructor(private props: TicketProps) {
    super();
  }

  /** New tickets are always `open`; status is never an input. */
  static create(input: { id: string; title: string; description: string }, actor: Actor): Ticket {
    const now = new Date();
    const ticket = new Ticket({
      id: input.id,
      title: parseTitle(input.title),
      description: parseDescription(input.description),
      status: TicketStatus.OPEN,
      requesterId: actor.id,
      assigneeId: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      deletedAt: null,
      version: 0,
    });
    ticket.raise(new TicketCreated(input.id, actor.id));
    return ticket;
  }

  /** Rebuild from storage. No validation and no events. */
  static rehydrate(props: TicketProps): Ticket {
    return new Ticket({ ...props });
  }

  get id() { return this.props.id; }
  get title() { return this.props.title; }
  get description() { return this.props.description; }
  get status() { return this.props.status; }
  get requesterId() { return this.props.requesterId; }
  get assigneeId() { return this.props.assigneeId; }
  get createdAt() { return this.props.createdAt; }
  get updatedAt() { return this.props.updatedAt; }
  get resolvedAt() { return this.props.resolvedAt; }
  get deletedAt() { return this.props.deletedAt; }
  get version() { return this.props.version; }

  snapshot(): TicketProps {
    return { ...this.props };
  }

  /** Customers see only their own tickets; staff see all. Soft-deleted tickets are invisible to everyone. */
  isVisibleTo(actor: Actor): boolean {
    if (this.props.deletedAt) return false;
    return isStaff(actor) || this.props.requesterId === actor.id;
  }

  /** Only the requesting customer, and only while the ticket is still `open`. */
  edit(actor: Actor, changes: { title?: string; description?: string }): void {
    if (actor.role !== ActorRole.CUSTOMER || actor.id !== this.props.requesterId) {
      throw new ActorNotAllowedError('Only the customer who raised a ticket can edit it');
    }
    this.assertNotClosed();
    if (this.props.status !== TicketStatus.OPEN) {
      throw new ActorNotAllowedError('A ticket can only be edited while it is open');
    }
    if (changes.title !== undefined) this.props.title = parseTitle(changes.title);
    if (changes.description !== undefined) this.props.description = parseDescription(changes.description);
    this.touch();
  }

  changeStatus(actor: Actor, to: TicketStatus): void {
    // Permission is checked before the lifecycle so a customer trying to
    // resolve gets 403, not a misleading 409.
    this.assertMayChangeStatus(actor, to);
    const from = this.props.status;
    if (!canTransition(from, to)) throw new InvalidStatusTransitionError(from, to);

    this.props.status = to;
    if (to === TicketStatus.RESOLVED) this.props.resolvedAt = new Date();
    if (from === TicketStatus.RESOLVED && to === TicketStatus.IN_PROGRESS) this.props.resolvedAt = null;
    this.touch();
    this.raise(new TicketStatusChanged(this.props.id, from, to, actor.id));
  }

  /** Throws unless `actor` may assign/unassign right now. Cheap, so callers can fail fast before I/O. */
  assertCanAssign(actor: Actor): void {
    if (!isStaff(actor)) throw new ActorNotAllowedError('Only support agents can assign tickets');
    this.assertNotClosed();
  }

  /** Assigning an `open` ticket also moves it to `in_progress` in the same operation. */
  assign(actor: Actor, assigneeId: string): void {
    this.assertCanAssign(actor);
    if (this.props.assigneeId === assigneeId) return;

    this.props.assigneeId = assigneeId;
    this.raise(new TicketAssigned(this.props.id, assigneeId, actor.id));
    if (this.props.status === TicketStatus.OPEN) {
      this.props.status = TicketStatus.IN_PROGRESS;
      this.raise(new TicketStatusChanged(this.props.id, TicketStatus.OPEN, TicketStatus.IN_PROGRESS, actor.id));
    }
    this.touch();
  }

  unassign(actor: Actor): void {
    this.assertCanAssign(actor);
    if (this.props.assigneeId === null) return;

    this.props.assigneeId = null;
    this.touch();
    this.raise(new TicketAssigned(this.props.id, null, actor.id));
  }

  /** Admin: always. Customer: own ticket while `open`. Agents: never. */
  softDelete(actor: Actor): void {
    const ownOpen =
      actor.role === ActorRole.CUSTOMER &&
      actor.id === this.props.requesterId &&
      this.props.status === TicketStatus.OPEN;
    if (actor.role !== ActorRole.ADMIN && !ownOpen) {
      throw new ActorNotAllowedError('You are not allowed to delete this ticket');
    }
    this.props.deletedAt = new Date();
    this.touch();
    this.raise(new TicketDeleted(this.props.id, actor.id));
  }

  /**
   * Staff may make any valid transition. A customer may only close their own
   * ticket, or reopen their own `resolved` ticket.
   */
  private assertMayChangeStatus(actor: Actor, to: TicketStatus): void {
    if (isStaff(actor)) return;
    const reopening = this.props.status === TicketStatus.RESOLVED && to === TicketStatus.IN_PROGRESS;
    const allowed = actor.id === this.props.requesterId && (to === TicketStatus.CLOSED || reopening);
    if (!allowed) throw new ActorNotAllowedError('You are not allowed to make this status change');
  }

  private assertNotClosed(): void {
    if (this.props.status === TicketStatus.CLOSED) throw new TicketClosedError();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
