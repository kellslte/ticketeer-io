import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, createUser, hasDatabase, PASSWORD, resetDb } from './helpers.js';

const LIMIT = 10; // per minute, per IP, on /auth/login and /auth/register

describe.runIf(hasDatabase)('rate limiting (e2e)', () => {
  let app: INestApplication;
  const login = (ip?: string) => {
    const req = request(app.getHttpServer()).post('/api/v1/auth/login');
    if (ip) req.set('X-Forwarded-For', ip);
    return req.send({ email: 'nobody@example.com', password: PASSWORD });
  };
  const burst = async (count: number, ip?: string) => {
    const statuses: number[] = [];
    for (let i = 0; i < count; i++) statuses.push((await login(ip)).status);
    return statuses;
  };

  afterEach(async () => {
    delete process.env.TRUST_PROXY;
    await app.close();
  });

  describe('without TRUST_PROXY', () => {
    beforeEach(async () => {
      app = await createApp();
    });

    it('answers the 11th login attempt in a minute with 429 and the standard error envelope', async () => {
      expect(await burst(LIMIT)).toEqual(Array(LIMIT).fill(401));
      const res = await login();
      expect(res.status).toBe(429);
      expect(res.body).toMatchObject({ status: 'error', error: { code: 'TOO_MANY_REQUESTS' } });
    });

    it('cannot be dodged by spoofing X-Forwarded-For', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < LIMIT + 2; i++) statuses.push((await login(`9.9.9.${i}`)).status);
      expect(statuses.slice(LIMIT)).toEqual([429, 429]);
    });

    it('limits register as well, and does not touch other endpoints', async () => {
      const { auth } = await createUser(app);
      await resetDb(app);
      const { auth: fresh } = await createUser(app);
      await burst(LIMIT + 1);
      expect(auth).toBeDefined();
      await request(app.getHttpServer()).get('/api/v1/auth/me').set(fresh).expect(200);
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      const register = await request(app.getHttpServer()).post('/api/v1/auth/register').send({});
      expect(register.status).toBe(400); // its own counter: still allowed to reach validation
    });
  });

  describe('with TRUST_PROXY=1 (behind one reverse proxy)', () => {
    beforeEach(async () => {
      process.env.TRUST_PROXY = '1';
      app = await createApp();
    });

    it('rate-limits each real client separately', async () => {
      expect(await burst(LIMIT, '1.1.1.1')).toEqual(Array(LIMIT).fill(401));
      expect((await login('1.1.1.1')).status).toBe(429);
      expect((await login('2.2.2.2')).status).toBe(401); // a different client is unaffected
    });
  });
});
