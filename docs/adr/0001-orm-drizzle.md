# ADR-0001: Use Drizzle ORM for database access and migrations

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-11-06 |
| **Deciders** | Product owner, tech lead |
| **PRD ref** | D-01 |

## Context

The baseline leaves the ORM open: Prisma or Drizzle. The schema in [DATABASE_ERD.md](../DATABASE_ERD.md) depends heavily on PostgreSQL features:

- Row-level security policies on every tenant table, with tenant context set by `set_config('app.tenant_id', …, true)` inside each transaction.
- Composite foreign keys `(tenant_id, id)` for tenant-consistent relationships.
- `CHECK` constraints, partial unique indexes, generated columns, an exclusion constraint on tax-rate date ranges, and triggers that block edits and deletes of posted documents.
- Neon's pooled endpoint (PgBouncer, transaction mode).

Every migration needs human review, so reviewers must be able to read exactly what SQL will run.

## Options considered

1. **Drizzle**
   - Pros: schema is TypeScript but close to SQL; generated migrations are plain SQL files that reviewers read directly; raw SQL (RLS, triggers, exclusion constraints) sits naturally in the same migration files; easy to run `set_config` as the first statement of a transaction; works with Neon's serverless and pooled drivers; supports composite FKs, checks and generated columns.
   - Cons: younger ecosystem; fewer guard rails than Prisma; the team must be comfortable with SQL.
2. **Prisma**
   - Pros: mature, very good developer experience and documentation; strongly typed client; large community.
   - Cons: the Prisma schema can't express RLS policies, triggers or exclusion constraints, so many migrations become hand-edited SQL anyway; tenant context needs interactive transactions or client extensions that wrap every query, which is easier to get subtly wrong; its migration model hides more SQL from reviewers.

## Decision

Use **Drizzle** with SQL migrations committed under `apps/api/drizzle/`.

The deciding factor is that RLS and database-level integrity rules are central to this product's security and financial correctness, and Drizzle keeps them visible and reviewable in one place.

## Consequences

- One `TransactionManager` in `infrastructure/db` opens each request transaction and sets tenant and user context first. Repositories must use the transaction handle it provides; a lint rule or test should catch direct use of the root client in tenant modules.
- Migrations run in CI against a fresh Neon branch (or Testcontainers Postgres) and are applied with the owner role, never the app role.
- A CI test checks every table with a `tenant_id` column has RLS enabled, forced and a `tenant_isolation` policy.
- Money columns map to `string` in TypeScript (never `number`) and are converted with `decimal.js`.

## Revisit when

- Drizzle can't support a required Postgres feature without awkward workarounds.
- The team finds SQL-first migrations slow them down materially after Sprint 2.
