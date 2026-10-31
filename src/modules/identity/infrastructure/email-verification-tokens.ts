import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Stateless, signed `userId.expiresAt.signature` tokens. Verifying is idempotent, so no table or
 * single-use tracking is needed. The key is derived from the app secret with a purpose label, so
 * these can never be confused with (or forged from) access tokens.
 */
export class EmailVerificationTokens {
  constructor(private readonly secret: string) {}

  issue(userId: string, now = Date.now()): string {
    const body = `${userId}.${now + TTL_MS}`;
    return `${body}.${this.sign(body)}`;
  }

  /** Returns the user id, or null if the token is malformed, tampered with or expired. */
  verify(token: string, now = Date.now()): string | null {
    const [userId, expires, signature, ...rest] = token.split('.');
    if (!userId || !expires || !signature || rest.length) return null;
    const expected = Buffer.from(this.sign(`${userId}.${expires}`));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return Number(expires) > now ? userId : null;
  }

  private sign(body: string): string {
    const key = createHmac('sha256', this.secret).update('email-verification').digest();
    return createHmac('sha256', key).update(body).digest('base64url');
  }
}
