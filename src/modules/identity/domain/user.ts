import { Role } from './role.js';

export interface UserProps {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
}

export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export class User {
  private constructor(private props: UserProps) {}

  /** Self-registration always yields a customer; staff roles are granted by an admin. */
  static register(input: { id: string; email: string; name: string; passwordHash: string }): User {
    return new User({
      ...input,
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      role: Role.CUSTOMER,
      createdAt: new Date(),
    });
  }

  static rehydrate(props: UserProps): User {
    return new User({ ...props });
  }

  get id() { return this.props.id; }
  get email() { return this.props.email; }
  get name() { return this.props.name; }
  get passwordHash() { return this.props.passwordHash; }
  get role() { return this.props.role; }
  get createdAt() { return this.props.createdAt; }

  changeRole(role: Role): void {
    this.props.role = role;
  }
}
