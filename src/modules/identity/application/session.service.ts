import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { InvalidRefreshTokenError } from '../domain/errors.js';
import { REFRESH_TOKEN_STORE, type RefreshTokenStore } from '../domain/refresh-token.store.js';
import { TOKEN_ISSUER, type TokenIssuer } from '../domain/token-issuer.js';
import type { User } from '../domain/user.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Access token + rotating refresh token. Every refresh invalidates the presented token and issues a
 * new one in the same family; presenting an already-used token kills the family.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
    @Inject(REFRESH_TOKEN_STORE) private readonly store: RefreshTokenStore,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /** New login: starts a new token family. */
  open(user: User) {
    return this.issue(user, randomUUID());
  }

  async rotate(refreshToken: string) {
    const record = await this.store.consume(hash(refreshToken));
    if (!record || record.expiresAt.getTime() <= Date.now()) throw new InvalidRefreshTokenError();
    // Reload so a role change or deleted account takes effect on refresh, not only at next login.
    const user = await this.users.findById(record.userId);
    if (!user) throw new InvalidRefreshTokenError();
    // ponytail: consume and create are separate statements; a crash between them just forces a re-login.
    return this.issue(user, record.familyId);
  }

  logout(refreshToken: string) {
    return this.store.revokeFamilyOf(hash(refreshToken));
  }

  private async issue(user: User, familyId: string) {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.store.create({
      userId: user.id,
      familyId,
      tokenHash: hash(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    return { ...(await this.tokens.issue(user)), refreshToken };
  }
}
