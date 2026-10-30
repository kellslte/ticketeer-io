import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { seedAdmin } from '../scripts/seed-admin.js';
import { createApp, createUser, hasDatabase, resetDb } from './helpers.js';

describe.runIf(hasDatabase)('admin seed (e2e)', () => {
  let app: INestApplication;
  let db: NodePgDatabase;

  beforeAll(async () => {
    app = await createApp();
    db = app.get<NodePgDatabase>(getDrizzleToken());
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  it('creates an admin who can log in, then does nothing on re-run', async () => {
    expect(await seedAdmin(db, 'Root@Example.com', 'a-long-admin-password')).toBe('created');
    expect(await seedAdmin(db, 'root@example.com', 'a-long-admin-password')).toBe('unchanged');

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'root@example.com', password: 'a-long-admin-password' })
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data.role).toBe('admin');
  });

  it('refuses to promote a pre-registered non-admin account (account pre-hijacking)', async () => {
    await createUser(app, 'customer', 'existing@example.com');
    await expect(seedAdmin(db, 'EXISTING@example.com', 'a-long-admin-password')).rejects.toThrow(/refusing to promote/);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'existing@example.com', password: 'correct-horse-battery' })
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data.role).toBe('customer');
  });
});
