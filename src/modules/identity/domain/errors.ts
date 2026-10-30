import { DomainError } from '../../../shared/domain/domain-error.js';

export class EmailAlreadyRegisteredError extends DomainError {
  readonly code = 'EMAIL_TAKEN';
  constructor() {
    super('An account with this email already exists');
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  constructor() {
    super('Invalid email or password');
  }
}

export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';
  constructor() {
    super('User not found');
  }
}

export class CannotChangeOwnRoleError extends DomainError {
  readonly code = 'FORBIDDEN';
  constructor() {
    super('You cannot change your own role');
  }
}
