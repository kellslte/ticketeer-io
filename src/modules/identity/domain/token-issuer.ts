import type { User } from './user.js';

export const TOKEN_ISSUER = Symbol('TOKEN_ISSUER');

export interface TokenIssuer {
  issue(user: User): Promise<{ accessToken: string; expiresIn: number }>;
}
