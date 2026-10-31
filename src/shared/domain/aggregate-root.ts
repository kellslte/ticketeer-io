import type { DomainEvent } from './domain-event.js';

export abstract class AggregateRoot {
  private events: DomainEvent[] = [];

  protected raise(event: DomainEvent): void {
    this.events.push(event);
  }

  /** Read-only view for repositories that persist events (outbox) in the same transaction as the aggregate. */
  get pendingEvents(): readonly DomainEvent[] {
    return this.events;
  }

  /** Returns the pending events and clears them, so each is dispatched once. */
  pullEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }
}
