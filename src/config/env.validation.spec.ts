import { validateEnv } from './env.validation.js';

const ok = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'a-sufficiently-long-random-secret-value-123',
};

describe('validateEnv', () => {
  it('accepts a valid config', () => {
    expect(validateEnv(ok)).toBe(ok);
  });

  it('rejects a missing or non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ ...ok, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...ok, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('requires JWT_SECRET', () => {
    expect(() => validateEnv({ ...ok, JWT_SECRET: '' })).toThrow(/JWT_SECRET is required/);
  });

  it('allows a short secret outside production only', () => {
    expect(() => validateEnv({ ...ok, JWT_SECRET: 'dev' })).not.toThrow();
    expect(() => validateEnv({ ...ok, JWT_SECRET: 'dev', NODE_ENV: 'production' })).toThrow(/32/);
  });

  it('rejects placeholder secrets in production', () => {
    const secret = 'change-me-to-at-least-32-random-characters';
    expect(() => validateEnv({ ...ok, JWT_SECRET: secret, NODE_ENV: 'production' })).toThrow(/placeholder/);
  });
});
