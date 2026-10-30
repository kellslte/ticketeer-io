import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../modules/identity/interfaces/http/decorators.js';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  @Get()
  async check() {
    try {
      await this.db.execute(sql`select 1`);
    } catch (error) {
      this.logger.error('Database health check failed', error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException({ code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable' });
    }
    return { database: 'up' };
  }
}
