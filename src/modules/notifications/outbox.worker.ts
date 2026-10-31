import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, isNull, lt, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { outbox } from '../../shared/infrastructure/outbox.table.js';
import { NotificationHandler } from './notification.handler.js';

const POLL_MS = 2_000;
const BATCH = 10;
const MAX_ATTEMPTS = 8;

/**
 * Polls the outbox and delivers pending messages (at least once). Runs in-process; because rows are
 * claimed with FOR UPDATE SKIP LOCKED, running more instances (or moving this to its own process) is safe.
 */
@Injectable()
export class OutboxWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('OutboxWorker');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly handler: NotificationHandler,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    // Tests call drain() themselves; a background poller would race them.
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.drain(), POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Processes due messages until none are left. Returns how many were delivered. */
  async drain(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let delivered = 0;
    try {
      for (;;) {
        const n = await this.processBatch();
        delivered += n.delivered;
        if (n.claimed < BATCH) return delivered;
      }
    } catch (error) {
      this.logger.error(`Outbox poll failed: ${error instanceof Error ? error.message : String(error)}`);
      return delivered;
    } finally {
      this.running = false;
    }
  }

  private processBatch() {
    // ponytail: the claim transaction stays open while emails are sent. Fine at this volume;
    // switch to claim-then-release with a lease timestamp if sends get slow or batches large.
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outbox)
        .where(and(isNull(outbox.processedAt), lte(outbox.nextAttemptAt, sql`now()`), lt(outbox.attempts, MAX_ATTEMPTS)))
        .orderBy(asc(outbox.createdAt))
        .limit(BATCH)
        .for('update', { skipLocked: true });

      let delivered = 0;
      for (const row of rows) {
        try {
          await this.handler.handle(row.type, row.payload as Record<string, string>);
          await tx.update(outbox).set({ processedAt: new Date() }).where(sql`${outbox.id} = ${row.id}`);
          delivered++;
        } catch (error) {
          const attempts = row.attempts + 1;
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Outbox ${row.type} ${row.id} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`);
          await tx
            .update(outbox)
            .set({
              attempts,
              lastError: message,
              // exponential backoff: 10s, 20s, 40s, ...
              nextAttemptAt: new Date(Date.now() + 10_000 * 2 ** (attempts - 1)),
            })
            .where(sql`${outbox.id} = ${row.id}`);
        }
      }
      return { claimed: rows.length, delivered };
    });
  }
}
