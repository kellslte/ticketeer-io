import { AggregateRoot } from './aggregate-root.js';
import { DomainEvent } from './domain-event.js';

class Poked extends DomainEvent {}

class Thing extends AggregateRoot {
  poke() {
    this.raise(new Poked('t1'));
  }
}

describe('AggregateRoot', () => {
  it('hands out pending events exactly once', () => {
    const thing = new Thing();
    thing.poke();
    expect(thing.pullEvents()).toHaveLength(1);
    expect(thing.pullEvents()).toHaveLength(0);
  });
});
