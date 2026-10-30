import type { DomainEvent } from './domain-event.js';

export abstract class AggregateRoot {
  private events: DomainEvent[] = [];

  protected raise(event: DomainEvent): void {
    this.events.push(event);
  }

  /** Returns the pending events and clears them, so each is dispatched once. */
  pullEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }
}
