import type { User } from './user.js';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  /** `email` must already be normalized. */
  findByEmail(email: string): Promise<User | null>;
  /** Upsert by id. Throws EmailAlreadyRegisteredError when the email is taken. */
  save(user: User): Promise<void>;
}
