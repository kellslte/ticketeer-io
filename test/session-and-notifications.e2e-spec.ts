import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { MAILER, type Mail } from '../src/modules/notifications/mailer.js';
import { OutboxWorker } from '../src/modules/notifications/outbox.worker.js';
import { applyAppSettings } from '../src/setup-app.js';
import { createUser, hasDatabase, PASSWORD, resetDb } from './helpers.js';

describe.runIf(hasDatabase)('refresh tokens, verification email and outbox (e2e)', () => {
  let app: INestApplication;
  let worker: OutboxWorker;
  let sent: Mail[];
  let failNext = false;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue({
        send: async (mail: Mail) => {
          if (failNext) {
            failNext = false;
            throw new Error('mailtrap down');
          }
          sent.push(mail);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    applyAppSettings(app);
    await app.init();
    worker = app.get(OutboxWorker);
  });
  beforeEach(async () => {
    sent = [];
    await resetDb(app);
  });
  afterAll(() => app.close());

  const login = async (email: string) =>
    (await http().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200)).body.data;

  describe('refresh token rotation', () => {
    it('rotates, rejects reuse, and then revokes the whole family', async () => {
      await createUser(app, 'customer', 'rot@example.com');
      const first = await login('rot@example.com');
      const refresh = (refreshToken: string) => http().post('/api/v1/auth/refresh').send({ refreshToken });

      const second = (await refresh(first.refreshToken).expect(200)).body.data;
      expect(second.refreshToken).not.toBe(first.refreshToken);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${second.accessToken}`).expect(200);

      const replay = await refresh(first.refreshToken).expect(401);
      expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      await refresh(second.refreshToken).expect(401); // family revoked by the replay
    });

    it('logout revokes the token', async () => {
      await createUser(app, 'customer', 'out@example.com');
      const { refreshToken } = await login('out@example.com');
      await http().post('/api/v1/auth/logout').send({ refreshToken }).expect(204);
      await http().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('only one of two concurrent refreshes with the same token wins', async () => {
      await createUser(app, 'customer', 'race@example.com');
      const { refreshToken } = await login('race@example.com');
      const results = await Promise.all(
        [1, 2].map(() => http().post('/api/v1/auth/refresh').send({ refreshToken })),
      );
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 401]);
    });
  });

  describe('email verification via the outbox', () => {
    it('registers, emails a link after the worker runs, and the link verifies the account', async () => {
      await http()
        .post('/api/v1/auth/register')
        .send({ email: 'verify@example.com', password: PASSWORD, name: 'Vera' })
        .expect(201);
      expect(sent).toHaveLength(0); // nothing is sent inline

      expect(await worker.drain()).toBe(1);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: 'verify@example.com', subject: 'Verify your email' });
      const token = new URL(/https?:\/\/\S+/.exec(sent[0]!.text)![0]).searchParams.get('token')!;

      await http().get('/api/v1/auth/verify-email').query({ token }).expect(200);
      await http().get('/api/v1/auth/verify-email').query({ token }).expect(200); // idempotent
      await http().get('/api/v1/auth/verify-email').query({ token: `${token}x` }).expect(400);

      const { accessToken } = await login('verify@example.com');
      const me = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
      expect(me.body.data.emailVerified).toBe(true);

      expect(await worker.drain()).toBe(0); // processed rows are not redelivered
    });

    it('retries a failed delivery later instead of losing it', async () => {
      await http()
        .post('/api/v1/auth/register')
        .send({ email: 'retry@example.com', password: PASSWORD, name: 'Rita' })
        .expect(201);
      failNext = true;
      expect(await worker.drain()).toBe(0);
      expect(sent).toHaveLength(0);
      expect(await worker.drain()).toBe(0); // backing off, not due yet
    });

    it('resend queues another email only while unverified', async () => {
      const { auth, user } = await createUser(app, 'customer', 'again@example.com');
      await worker.drain(); // flush the verification email queued by registration
      sent = [];
      await http().post('/api/v1/auth/resend-verification').set(auth).expect(202);
      expect(await worker.drain()).toBe(1);
      expect(sent[0]?.to).toBe(user.email);
    });
  });

  describe('ticket notifications', () => {
    it('emails the assignee when a ticket is assigned and the requester on status change', async () => {
      const customer = await createUser(app, 'customer', 'req@example.com');
      const agent = await createUser(app, 'agent', 'agent@example.com');
      const admin = await createUser(app, 'admin', 'boss@example.com');
      await worker.drain(); // flush the verification emails queued by registration
      sent = [];
      const created = await http()
        .post('/api/v1/tickets')
        .set(customer.auth)
        .send({ title: 'Printer on fire', description: 'It is literally on fire.' })
        .expect(201);
      const id = created.body.data.id;

      await http().patch(`/api/v1/tickets/${id}`).set(admin.auth).send({ assigneeId: agent.user.id }).expect(200);
      await worker.drain();
      expect(sent.map((m) => m.to)).toContain('agent@example.com');
      expect(sent.find((m) => m.to === 'agent@example.com')?.subject).toContain('Printer on fire');
      expect(sent.map((m) => m.to)).toContain('req@example.com'); // assigning moves open -> in_progress
    });
  });
});
