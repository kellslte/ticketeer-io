// Runs before every e2e file, so AppModule (which reads env at import time) sees these.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'e2e-secret-that-is-at-least-32-characters';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://nobody:nobody@127.0.0.1:1/none';
