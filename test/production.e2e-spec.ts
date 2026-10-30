import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/shared/errors/all-exceptions.filter.js';
import { applyAppSettings } from '../src/setup-app.js';

@Controller('probe')
class ProbeController {
  @Get('boom') boom() { throw new Error('connection string postgres://admin:hunter2@db/prod failed'); }
}

// A small app with just the production-sensitive wiring, so it needs no database.
// Boot-time rejection of a missing/placeholder JWT_SECRET is covered by src/config/env.validation.spec.ts.
describe('production mode (e2e)', () => {
  let app: INestApplication;
  const previousEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [ProbeController],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    }).compile();
    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();
  });

  afterAll(async () => {
    process.env.NODE_ENV = previousEnv;
    await app.close();
  });

  it('does not serve Swagger UI or the OpenAPI document', async () => {
    await request(app.getHttpServer()).get('/docs').expect(404);
    await request(app.getHttpServer()).get('/docs/json').expect(404);
  });

  it('never leaks the message or stack of an unexpected error', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/boom').expect(500);
    expect(res.body.error).toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' });
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|postgres:|stack/i);
  });

  it('enables the strict Content-Security-Policy header', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/boom');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
