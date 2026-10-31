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

export class AccountLockedError extends DomainError {
  readonly code = 'ACCOUNT_LOCKED';
  constructor(message = 'Account is temporarily locked due to too many failed login attempts. Please try again in 30 minutes.') {
    super(message);
  }
}

export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'INVALID_REFRESH_TOKEN';
  constructor() {
    super('Invalid or expired refresh token');
  }
}

export class InvalidVerificationTokenError extends DomainError {
  readonly code = 'INVALID_VERIFICATION_TOKEN';
  constructor() {
    super('Invalid or expired verification token');
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
