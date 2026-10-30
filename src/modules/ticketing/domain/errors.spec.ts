import { DOMAIN_ERROR_STATUS } from '../../../shared/errors/error-codes.js';
import {
  ActorNotAllowedError,
  ConcurrentModificationError,
  InvalidAssigneeError,
  InvalidStatusTransitionError,
  InvalidTicketFieldError,
  TicketClosedError,
  TicketNotFoundError,
} from './errors.js';

// Guards against adding a domain error without mapping it to an HTTP status.
const errors = [
  new TicketNotFoundError('t-1'),
  new InvalidStatusTransitionError('open', 'resolved'),
  new TicketClosedError(),
  new ActorNotAllowedError(),
  new InvalidAssigneeError(),
  new ConcurrentModificationError(),
  new InvalidTicketFieldError('bad'),
];

describe('ticketing domain errors', () => {
  it.each(errors.map((e) => [e.name, e] as const))('%s maps to an HTTP status', (_name, error) => {
    expect(DOMAIN_ERROR_STATUS[error.code]).toBeDefined();
  });
});
