import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { RefreshTokenRecord, RefreshTokenStore } from '../domain/refresh-token.store.js';
import { refreshTokens } from './refresh-tokens.table.js';

@Injectable()
export class DrizzleRefreshTokenStore implements RefreshTokenStore {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  async create(record: RefreshTokenRecord & { tokenHash: string }): Promise<void> {
    await this.db.insert(refreshTokens).values(record);
  }

  async consume(tokenHash: string): Promise<RefreshTokenRecord | null> {
    // Single conditional UPDATE: of two concurrent refreshes with the same token, only one gets a row.
    const [used] = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
      .returning({ userId: refreshTokens.userId, familyId: refreshTokens.familyId, expiresAt: refreshTokens.expiresAt });
    if (used) return used;
    await this.revokeFamilyOf(tokenHash); // known but already used: treat as theft/replay
    return null;
  }

  async revokeFamilyOf(tokenHash: string): Promise<void> {
    const [token] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    if (!token) return;
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, token.familyId), isNull(refreshTokens.revokedAt)));
  }
}
