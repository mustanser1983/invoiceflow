# Changelog

All notable changes to Invoiceflow are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Master documents v1.0: PRD, database architecture and ERD, technical architecture and API, sprint backlog with acceptance criteria.
- Repository structure, contribution guidelines, PR template and CODEOWNERS.
- ADR-0001 (ORM), ADR-0002 (authentication provider), ADR-0003 (object storage) — status Proposed.
- Sprint 0 skeleton (S0-3 – S0-8):
  - npm workspaces monorepo, Node 22, Prettier, EditorConfig.
  - `apps/api`: NestJS 12 (ES modules), `GET /health` and `GET /health/db`, standard response/error envelopes, `X-Request-Id`, env validation, Drizzle config and `0000_init` migration (Postgres extensions only), Jest in ESM mode.
  - `apps/admin`: Next.js 16 placeholder sign-in page.
  - `apps/mobile`: Flutter app source with five-tab bottom navigation, dev/staging/prod build configs, English strings externalised; widget tests.
  - GitHub Actions CI: API lint/typecheck/test/build plus migrations and health check against Postgres 16; admin lint/typecheck/build; Flutter analyze/test/debug APK.
