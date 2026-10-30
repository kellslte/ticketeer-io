export abstract class DomainEvent {
  readonly occurredAt = new Date();

  constructor(readonly aggregateId: string) {}
}
