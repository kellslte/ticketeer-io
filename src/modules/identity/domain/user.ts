import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { EmailVerificationRequested } from './events.js';
import { Role } from './role.js';

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export interface UserProps {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
}

export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export class User extends AggregateRoot {
  private constructor(private props: UserProps) {
    super();
  }

  /** Self-registration always yields a customer; staff roles are granted by an admin. */
  static register(input: { id: string; email: string; name: string; passwordHash: string }): User {
    const user = new User({
      ...input,
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      role: Role.CUSTOMER,
      emailVerifiedAt: null,
      createdAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    user.requestEmailVerification();
    return user;
  }

  static rehydrate(props: UserProps): User {
    return new User({
      ...props,
      failedLoginAttempts: props.failedLoginAttempts ?? 0,
      lockedUntil: props.lockedUntil ? new Date(props.lockedUntil) : null,
    });
  }

  get id() { return this.props.id; }
  get email() { return this.props.email; }
  get name() { return this.props.name; }
  get passwordHash() { return this.props.passwordHash; }
  get role() { return this.props.role; }
  get emailVerifiedAt() { return this.props.emailVerifiedAt; }
  get createdAt() { return this.props.createdAt; }
  get failedLoginAttempts() { return this.props.failedLoginAttempts ?? 0; }
  get lockedUntil() { return this.props.lockedUntil ?? null; }

  isLocked(now = new Date()): boolean {
    return !!this.props.lockedUntil && this.props.lockedUntil.getTime() > now.getTime();
  }

  recordFailedLogin(now = new Date()): void {
    // If a previous lockout has expired, reset counter before recording new failure
    if (this.props.lockedUntil && this.props.lockedUntil.getTime() <= now.getTime()) {
      this.props.failedLoginAttempts = 0;
      this.props.lockedUntil = null;
    }

    const attempts = (this.props.failedLoginAttempts ?? 0) + 1;
    this.props.failedLoginAttempts = attempts;

    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      this.props.lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
    }
  }

  recordSuccessfulLogin(): void {
    this.props.failedLoginAttempts = 0;
    this.props.lockedUntil = null;
  }

  /** Idempotent. */
  verifyEmail(): void {
    this.props.emailVerifiedAt ??= new Date();
  }

  /** Raises the event that makes the outbox send a (new) verification email. No-op once verified. */
  requestEmailVerification(): void {
    if (!this.props.emailVerifiedAt) this.raise(new EmailVerificationRequested(this.id));
  }

  changeRole(role: Role): void {
    this.props.role = role;
  }
}
