# Changelog

All notable changes to Invoiceflow are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Master documents v1.0: PRD, database architecture and ERD, technical architecture and API, sprint backlog with acceptance criteria.
- Repository structure, contribution guidelines, PR template and CODEOWNERS.
- ADR-0001 (ORM), ADR-0002 (authentication provider), ADR-0003 (object storage).
- Sprint 0 skeleton (S0-3 – S0-8):
  - npm workspaces monorepo, Node 22, Prettier, EditorConfig.
  - `apps/api`: NestJS 12 (ES modules), `GET /health` and `GET /health/db`, standard response/error envelopes, `X-Request-Id`, env validation, Drizzle config and `0000_init` migration (Postgres extensions only), Jest in ESM mode.
  - `apps/admin`: Next.js 16 placeholder sign-in page.
  - `apps/mobile`: Flutter app source with five-tab bottom navigation, dev/staging/prod build configs, English strings externalised; widget tests.
  - GitHub Actions CI: API lint/typecheck/test/build plus migrations and health check against Postgres 16; admin lint/typecheck/build; Flutter analyze/test/debug APK.
- Sprint 1 — database and authentication (S1-1 – S1-10, backend):
  - Migrations `0001`–`0003`: access and audit tables; seeded permission catalogue and six system roles; `invoiceflow_app` database role, row-level security on every tenant table, membership-role trigger, `updated_at` triggers.
  - `TransactionManager`: every request runs in one transaction as `invoiceflow_app` with transaction-local tenant/user context.
  - Firebase token verification behind `AuthProvider` (loaded lazily); `AuthGuard`, `RequestContextInterceptor` (membership + permission checks), `AuditService` with secret redaction, Zod validation, in-memory rate limiting.
  - Endpoints: `POST /auth/register`, `GET /auth/me`, `POST /auth/logout`, `POST /tenants`, `GET /tenants`, `GET /tenants/:id`, `PATCH /tenants/:id`.
  - Integration tests against real Postgres: RLS coverage, app-role privileges, pooled-connection context leak, cross-tenant reads and writes over HTTP, permission grants, audit rows.

- Sprint 2 — onboarding and settings (S2-1 – S2-5, S2-8 – S2-10, backend):
  - Migrations `0004`–`0005`: `tax_codes`, `tax_rates` (no overlapping rates), `tenant_tax_settings` with RLS; seeded UAE codes SR, ZR, EX, OS, SR-NR, RC (pending tax-adviser sign-off); keep-an-owner trigger; one pending invitation per email; `app.find_invitation` lookup.
  - Endpoints: `GET/PATCH /tax/settings`, `GET/POST /tax/codes`, `GET/PATCH /tenants/:id/settings`, `GET/PATCH /tenants/:id/numbering`, `POST /tenants/:id/complete-onboarding`, `GET /users`, `GET /users/invitations`, `POST /users/invite`, `DELETE /users/invitations/:id`, `POST /invitations/accept`, `PATCH /users/:userId`, `GET /roles`, `GET /permissions`.
  - New businesses get tax settings (not VAT registered).
  - `docs/TAX_RULES_UAE.md` draft.

### Changed
- ADR-0001 – 0003 accepted (2026-11-27). CODEOWNERS points at @mustanser1983.
- CI Postgres 16 → 18 (matches Neon); CI now runs integration tests against a throwaway database.
- CI pins Flutter 3.47.9: Flutter 3.50 deprecates `package:flutter/material.dart` in favour of `package:material_ui`, which fails `flutter analyze`.
- RLS uses `ENABLE` plus `SET LOCAL ROLE invoiceflow_app` instead of `FORCE` (DATABASE_ERD.md §2.1).
