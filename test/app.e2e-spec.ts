import { Body, Controller, Get, HttpCode, INestApplication, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString, MinLength } from 'class-validator';
import request from 'supertest';
import { Public } from '../src/modules/identity/interfaces/http/decorators.js';
import { DomainError } from '../src/shared/domain/domain-error.js';

import { AppModule } from '../src/app.module.js';
import { applyAppSettings } from '../src/setup-app.js';

class NotFound extends DomainError {
  readonly code = 'TICKET_NOT_FOUND';
}

class ProbeDto {
  @IsString() @MinLength(5) title!: string;
}

// Throwaway routes exercising the global pipe/filter/interceptor wiring.
@Public()
@Controller('probe')
class ProbeController {
  @Post() create(@Body() dto: ProbeDto) { return dto; }
  @Get('boom') boom() { throw new Error('secret internals'); }
  @Get('domain') domain() { throw new NotFound('no such ticket'); }
  @Get('empty') @HttpCode(204) empty() { return undefined; }
  @Get(':id') byId(@Param('id', ParseUUIDPipe) id: string) { return { id }; }
}

describe('app wiring (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('wraps successes in the envelope under /api/v1', async () => {
    const res = await http().post('/api/v1/probe').send({ title: 'long enough' }).expect(201);
    expect(res.body).toMatchObject({ status: 'success', data: { title: 'long enough' } });
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  it('returns field details for invalid bodies', async () => {
    const res = await http().post('/api/v1/probe').send({ title: 'abc' }).expect(400);
    expect(res.body.status).toBe('error');
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Validation failed' });
    expect(res.body.error.details[0]).toMatchObject({ field: 'title' });
    expect(res.body.error.traceId).toEqual(expect.any(String));
  });

  it('rejects unknown fields', async () => {
    const res = await http().post('/api/v1/probe').send({ title: 'long enough', status: 'resolved' }).expect(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ field: 'status' }));
  });

  it('rejects a non-UUID path param with 400', async () => {
    const res = await http().get('/api/v1/probe/not-a-uuid').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('maps domain errors via their code', async () => {
    const res = await http().get('/api/v1/probe/domain').expect(404);
    expect(res.body.error).toMatchObject({ code: 'TICKET_NOT_FOUND', message: 'no such ticket' });
  });

  it('hides internals of unexpected errors', async () => {
    const res = await http().get('/api/v1/probe/boom').expect(500);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret internals');
  });

  it('echoes x-request-id as traceId', async () => {
    const res = await http().get('/api/v1/probe/boom').set('x-request-id', 'req-123').expect(500);
    expect(res.body.error.traceId).toBe('req-123');
  });

  it('does not wrap 204 responses', async () => {
    const res = await http().get('/api/v1/probe/empty').expect(204);
    expect(res.text).toBe('');
  });

  it('404s unknown routes in the error envelope', async () => {
    const res = await http().get('/api/v1/nope').expect(404);
    expect(res.body).toMatchObject({ status: 'error', error: { code: 'NOT_FOUND' } });
  });

  it('serves Swagger outside production', async () => {
    await http().get('/docs/json').expect(200);
  });

  it('reports database health as 503 envelope when the DB is unreachable', async () => {
    if (process.env.TEST_DATABASE_URL) return; // covered by the next test
    const res = await http().get('/api/v1/health').expect(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it.runIf(process.env.TEST_DATABASE_URL)('reports database health when the DB is up', async () => {
    const res = await http().get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({ status: 'success', data: { database: 'up' } });
  });
});
