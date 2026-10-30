import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createApp, createUser, hasDatabase, PASSWORD, resetDb } from './helpers.js';

describe.runIf(hasDatabase)('auth (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  describe('POST /auth/register', () => {
    it('creates a customer and never returns the password hash', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: '  New.User@Example.com ', password: PASSWORD, name: ' New User ' })
        .expect(201);
      expect(res.body.data).toMatchObject({ email: 'new.user@example.com', name: 'New User', role: 'customer' });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    it('rejects a duplicate email regardless of case', async () => {
      await createUser(app, 'customer', 'dup@example.com');
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'DUP@example.com', password: PASSWORD, name: 'Dup' })
        .expect(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('validates input with field details', async () => {
      const res = await http().post('/api/v1/auth/register').send({ email: 'nope', password: 'short', name: '' }).expect(400);
      const fields = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'name']));
    });

    it('does not let callers choose their own role', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'sneaky@example.com', password: PASSWORD, name: 'Sneaky', role: 'admin' })
        .expect(400);
      expect(res.body.error.details).toContainEqual(expect.objectContaining({ field: 'role' }));
    });
  });

  describe('POST /auth/login', () => {
    it('returns a bearer token that works on /auth/me', async () => {
      const { user } = await createUser(app, 'customer', 'login@example.com');
      const login = await http().post('/api/v1/auth/login').send({ email: 'LOGIN@example.com', password: PASSWORD }).expect(200);
      expect(login.body.data).toMatchObject({ accessToken: expect.any(String), expiresIn: 900 });

      const me = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(200);
      expect(me.body.data).toMatchObject({ id: user.id, email: 'login@example.com', role: 'customer' });
    });

    it('gives the same 401 for a wrong password and an unknown email', async () => {
      await createUser(app, 'customer', 'known@example.com');
      const wrongPassword = await http().post('/api/v1/auth/login').send({ email: 'known@example.com', password: 'wrong-password' }).expect(401);
      const unknownEmail = await http().post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: PASSWORD }).expect(401);
      expect(wrongPassword.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
    });
  });

  describe('authentication', () => {
    it('keeps health public but protects everything else', async () => {
      await http().get('/api/v1/health').expect(200);
      const res = await http().get('/api/v1/auth/me').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it.each([
      ['a malformed header', 'Token abc'],
      ['garbage', 'Bearer not.a.jwt'],
    ])('rejects %s', async (_label, header) => {
      await http().get('/api/v1/auth/me').set('Authorization', header).expect(401);
    });

    it('rejects an expired token', async () => {
      const { user } = await createUser(app);
      const expired = await app.get(JwtService).signAsync({ sub: user.id, role: user.role }, { expiresIn: -10 });
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it('rejects a token signed with another secret', async () => {
      const { user } = await createUser(app);
      const forged = await new JwtService({ secret: 'x'.repeat(40) }).signAsync({ sub: user.id, role: 'admin' });
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('returns 404 for a valid token whose user no longer exists', async () => {
      const { auth } = await createUser(app);
      await resetDb(app);
      const res = await http().get('/api/v1/auth/me').set(auth).expect(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('PATCH /users/:id/role', () => {
    it('lets an admin promote a customer, effective at next login', async () => {
      const admin = await createUser(app, 'admin');
      const target = await createUser(app, 'customer', 'promote@example.com');

      const res = await http().patch(`/api/v1/users/${target.user.id}/role`).set(admin.auth).send({ role: 'agent' }).expect(200);
      expect(res.body.data.role).toBe('agent');

      const login = await http().post('/api/v1/auth/login').send({ email: 'promote@example.com', password: PASSWORD }).expect(200);
      const claims = app.get(JwtService).decode<{ role: string }>(login.body.data.accessToken);
      expect(claims.role).toBe('agent');
    });

    it.each(['customer', 'agent'] as const)('forbids a %s', async (role) => {
      const actor = await createUser(app, role);
      const target = await createUser(app);
      const res = await http().patch(`/api/v1/users/${target.user.id}/role`).set(actor.auth).send({ role: 'admin' }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('forbids an admin changing their own role', async () => {
      const admin = await createUser(app, 'admin');
      await http().patch(`/api/v1/users/${admin.user.id}/role`).set(admin.auth).send({ role: 'customer' }).expect(403);
    });

    it('404s an unknown user and 400s bad input', async () => {
      const admin = await createUser(app, 'admin');
      const unknown = await http().patch('/api/v1/users/6f1c8b5e-0000-4000-8000-000000000000/role').set(admin.auth).send({ role: 'agent' }).expect(404);
      expect(unknown.body.error.code).toBe('USER_NOT_FOUND');
      await http().patch('/api/v1/users/not-a-uuid/role').set(admin.auth).send({ role: 'agent' }).expect(400);
      const target = await createUser(app);
      await http().patch(`/api/v1/users/${target.user.id}/role`).set(admin.auth).send({ role: 'superuser' }).expect(400);
    });
  });
});
