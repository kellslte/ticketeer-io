import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { EmailVerificationRequested } from './events.js';
import { Role } from './role.js';

export interface UserProps {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  emailVerifiedAt: Date | null;
  createdAt: Date;
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
    });
    user.requestEmailVerification();
    return user;
  }

  static rehydrate(props: UserProps): User {
    return new User({ ...props });
  }

  get id() { return this.props.id; }
  get email() { return this.props.email; }
  get name() { return this.props.name; }
  get passwordHash() { return this.props.passwordHash; }
  get role() { return this.props.role; }
  get emailVerifiedAt() { return this.props.emailVerifiedAt; }
  get createdAt() { return this.props.createdAt; }

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
