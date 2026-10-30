# Ticketeer

A support-ticket API. Customers report issues; the support team tracks, assigns and resolves them.

NestJS 12 · TypeScript (ESM) · PostgreSQL · Drizzle ORM · JWT auth · Vitest · [NestJS Observe](https://observe.nestjs.com) for production telemetry.

## Quick start

Requires **Node 22+ (24 LTS recommended)**, [Bun](https://bun.sh) and a PostgreSQL 16 database.

```bash
bun install
cp .env.example .env            # then edit DATABASE_URL and JWT_SECRET
docker compose up -d            # optional: Postgres on :5433 (matches .env.example)
bun run db:migrate              # create the tables
bun run db:seed                 # create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD
bun run start:dev
```

- API: `http://localhost:3000/api/v1`
- Interactive docs: `http://localhost:3000/docs` (disabled when `NODE_ENV=production`)
- Health: `GET /api/v1/health`

> **Node version:** `argon2` is a native module. A binary compiled locally crashed (segfault) on Node 20.20.2 and works on Node 22, 24 and 26, so run and build on 22+.

## Configuration

Validated at startup; the app refuses to boot on a missing or unsafe value.

| Variable                                | Required  | Notes                                                                                                                                |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                          | yes       | `postgres://user:pass@host:port/db`                                                                                                  |
| `JWT_SECRET`                            | yes       | In production: at least 32 characters and not a placeholder such as `change-me…`                                                     |
| `JWT_EXPIRES_IN`                        | no        | Default `15m`. A role change takes effect when the token expires or the user logs in again                                           |
| `PORT`                                  | no        | Default `3000`                                                                                                                       |
| `CORS_ORIGINS`                          | no        | Comma-separated allow-list. Default `http://localhost:3000`                                                                          |
| `TRUST_PROXY`                           | no        | Set when behind a reverse proxy: a hop count (`1`) or an Express list (`loopback, 10.0.0.0/8`). See [Rate limiting](#security-notes) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`         | seed only | Password at least 10 characters                                                                                                      |
| `OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET` | no        | Written by `npx @nestjs/observe link`                                                                                                |

## API

Base path `/api/v1`. Every route needs `Authorization: Bearer <token>` except `GET /health`, `POST /auth/register` and `POST /auth/login`.

| Method & path           | Who                         | Purpose                                                                                                                                           |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`   | public                      | Create a customer account                                                                                                                         |
| `POST /auth/login`      | public                      | Returns `{ accessToken, expiresIn }`                                                                                                              |
| `GET /auth/me`          | any                         | Current user                                                                                                                                      |
| `PATCH /users/:id/role` | admin                       | Set a user's role (`customer`, `agent`, `admin`); not your own                                                                                    |
| `POST /tickets`         | any                         | Raise a ticket (`title`, `description`). It is always created `open`; sending `status` is a 400                                                   |
| `GET /tickets`          | any                         | List. Query: `status`, `assigneeId` (a user id or `me`), `page`, `limit` (max 100), `sort=createdAt:asc\|desc`. Customers only ever see their own |
| `GET /tickets/:id`      | owner, staff                | One ticket. Someone else's ticket is a 404, not a 403                                                                                             |
| `PATCH /tickets/:id`    | see below                   | Any of `title`, `description`, `status`, `assigneeId` (`null` unassigns). All-or-nothing                                                          |
| `DELETE /tickets/:id`   | owner (while `open`), admin | Soft delete, 204                                                                                                                                  |

**Status lifecycle:** `open → in_progress → resolved → closed`, plus `open|in_progress → closed` and `resolved → in_progress` (reopen). `closed` is final.

| Action                                          | Customer          | Agent | Admin |
| ----------------------------------------------- | ----------------- | ----- | ----- |
| Edit title/description                          | own, while `open` | no    | no    |
| Close own ticket / reopen own `resolved` ticket | yes               | –     | –     |
| Start work, resolve                             | **no (403)**      | yes   | yes   |
| Assign / unassign                               | no                | yes   | yes   |
| Delete                                          | own, while `open` | no    | any   |

Assigning an `open` ticket moves it to `in_progress` automatically. Assignees must be an agent or admin (otherwise 422).

**Responses** use one envelope:

```jsonc
{ "status": "success", "data": { }, "timestamp": "…" }
{ "status": "error", "error": { "code": "VALIDATION_ERROR", "message": "…",
    "details": [{ "field": "title", "message": "…" }], "traceId": "…", "timestamp": "…" }, "timestamp": "…" }
```

| Status | `error.code`                                                                           |
| ------ | -------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR` (bad body, unknown field, bad enum, non-UUID id)                    |
| 401    | `UNAUTHORIZED`, `INVALID_CREDENTIALS`                                                  |
| 403    | `FORBIDDEN`                                                                            |
| 404    | `TICKET_NOT_FOUND`, `USER_NOT_FOUND`                                                   |
| 409    | `INVALID_STATUS_TRANSITION`, `TICKET_CLOSED`, `CONCURRENT_MODIFICATION`, `EMAIL_TAKEN` |
| 422    | `INVALID_ASSIGNEE`                                                                     |
| 429    | `TOO_MANY_REQUESTS`                                                                    |
| 500    | `INTERNAL_SERVER_ERROR` (message is generic; details are logged, never returned)       |

`traceId` is the request's `x-request-id` header if you send one, otherwise a generated UUID.

## Architecture

Domain-driven, two bounded contexts that talk only through ids and a port:

```
src/
  main.ts, setup-app.ts        bootstrap; setup-app is shared with the e2e tests
  app.module.ts                global filter, guards (throttle → JWT → roles), interceptor
  config/                      environment validation
  shared/                      AggregateRoot, DomainEvent, DomainError, exception filter, envelope, validation pipe
  modules/
    identity/                  users, credentials, roles, JWT
    ticketing/                 the Ticket aggregate and its rules
      domain/                  pure TypeScript: Ticket, status rules, errors, events, ports
      application/             use-cases and DTOs
      infrastructure/          Drizzle tables and repositories, Identity adapter
      interfaces/http/         controllers
  health/
drizzle/                       SQL migrations (committed)
scripts/seed-admin.ts
test/                          end-to-end tests (real PostgreSQL)
```

- **The domain imports nothing from Nest, Drizzle or other layers.** A lint rule enforces it.
- Domain errors carry a stable `code` and no HTTP knowledge; one filter maps them to statuses.
- Ticketing refers to users by id only. It asks Identity "is this user an agent?" through the `AgentDirectory` port.
- Domain events are raised by the aggregate and published only after a successful save.

## Scripts

| Command                                | Does                                                                  |
| -------------------------------------- | --------------------------------------------------------------------- |
| `bun run start:dev`                    | Run with reload                                                       |
| `bun run build` / `bun run start:prod` | Compile to `dist/` / run it                                           |
| `bun run lint`, `bun run typecheck`    | Static checks                                                         |
| `bun run test`                         | Unit tests                                                            |
| `bun run test:cov`                     | Unit tests with the coverage gate (90% lines on domain + application) |
| `bun run test:e2e`                     | End-to-end tests; need `TEST_DATABASE_URL`                            |
| `bun run db:generate`                  | Create a migration after editing a `*.table.ts`                       |
| `bun run db:migrate`                   | Apply migrations to `DATABASE_URL`                                    |
| `bun run db:seed`                      | Create the first admin                                                |
| `bun run db:studio`                    | Browse the database                                                   |

### Testing

Unit tests need nothing. The e2e suite needs a dedicated, disposable database: it **truncates the `users` and `tickets` tables** before each test.

```bash
createdb ticketeer_test
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/ticketeer_test bun run test:e2e
```

Migrations are applied automatically at the start of the run. Without `TEST_DATABASE_URL` the database-backed tests are skipped (CI always sets it).

## Deploying

1. Build on Node 22+: `bun install --frozen-lockfile && bun run build`.
2. Run migrations as a **separate release step**, never at app start (several instances booting together would race): `bun run db:migrate`. It uses `drizzle-kit`, a dev dependency, so run it where dev dependencies are installed.
3. Create the first admin once: `bun run db:seed`. It never promotes an existing non-admin account; if the email is taken by one, it stops with an error.
4. Start with `NODE_ENV=production node dist/main`, behind a reverse proxy that terminates TLS, with `JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGINS` and `TRUST_PROXY` set.
5. Link the app to Observe (`npx @nestjs/observe link`) and check requests and errors appear in its dashboard.

`SIGTERM` handling is built in (`enableShutdownHooks`), so rolling restarts drain the database pool.

## Security notes

- **Passwords:** argon2id. Login does the same work for unknown and known emails and returns one error for both.
- **Authentication:** default-deny. Every route needs a valid token unless marked `@Public()`.
- **Rate limiting:** 300 requests/minute/IP overall; 10/minute/IP on `/auth/login` and `/auth/register`. The limit is per IP, so behind a proxy set `TRUST_PROXY` or all users share one bucket. Leave it unset without a proxy: otherwise clients could spoof `X-Forwarded-For` to dodge the limit. The counter is in memory, so with several instances each enforces its own limit.
- **Privilege:** nobody can self-assign a role on registration. An admin cannot change their own role, so the system cannot lock itself out.
- **Registration is open and emails are not verified.** Treat an email address as unproven identity until you add verification.
- Production responses never include internal error text or stack traces, and Swagger is not served.
