export const REFRESH_TOKEN_STORE = Symbol('REFRESH_TOKEN_STORE');

export interface RefreshTokenRecord {
  userId: string;
  familyId: string;
  expiresAt: Date;
}

export interface RefreshTokenStore {
  /** `tokenHash` is a hash of the opaque token; the raw token is never stored. */
  create(record: RefreshTokenRecord & { tokenHash: string }): Promise<void>;
  /**
   * Atomically marks the token used. Returns its record the first time only.
   * A second use of the same token (theft or replay) revokes the whole family and returns null,
   * as does an unknown token.
   */
  consume(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Revokes every token in the family of this token. Unknown tokens are ignored. */
  revokeFamilyOf(tokenHash: string): Promise<void>;
}
