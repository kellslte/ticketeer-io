import type { RefreshTokenRecord, RefreshTokenStore } from '../domain/refresh-token.store.js';
import type { PasswordHasher } from '../domain/password-hasher.js';
import type { TokenIssuer } from '../domain/token-issuer.js';
import type { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';

export class InMemoryUserRepository implements UserRepository {
  readonly items = new Map<string, User>();

  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findByEmail(email: string) {
    return [...this.items.values()].find((u) => u.email === email) ?? null;
  }
  async save(user: User) {
    this.items.set(user.id, user);
  }
}

/** Deterministic and fast: "hash" is a reversible prefix, so tests never pay for argon2. */
export const fakeHasher: PasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  verify: async (hash, plain) => hash === `hashed:${plain}`,
};

export const fakeTokens: TokenIssuer = {
  issue: async (user) => ({ accessToken: `token-for-${user.id}`, expiresIn: 900 }),
};

export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  readonly tokens = new Map<string, RefreshTokenRecord & { revoked: boolean }>();

  async create({ tokenHash, ...record }: RefreshTokenRecord & { tokenHash: string }) {
    this.tokens.set(tokenHash, { ...record, revoked: false });
  }
  async consume(tokenHash: string) {
    const token = this.tokens.get(tokenHash);
    if (!token) return null;
    if (token.revoked) {
      await this.revokeFamilyOf(tokenHash);
      return null;
    }
    token.revoked = true;
    return token;
  }
  async revokeFamilyOf(tokenHash: string) {
    const familyId = this.tokens.get(tokenHash)?.familyId;
    for (const t of this.tokens.values()) if (t.familyId === familyId) t.revoked = true;
  }
}
