# Invoiceflow — Project Documentation

Invoiceflow is a multi-tenant accounting and invoicing app for small businesses, starting with the UAE on Android.

## Master documents (approved baseline v1.0)

| # | Document | Purpose |
|---|---|---|
| 1 | [PRD.md](PRD.md) | Product requirements with traceable IDs (AUTH-, INV-, RCP-, VAT-…), non-functional requirements, open decisions |
| 2 | [DATABASE_ERD.md](DATABASE_ERD.md) | Schema standards, RLS design, ERD, reference DDL, integrity-rule enforcement |
| 3 | [ARCHITECTURE_AND_API.md](ARCHITECTURE_AND_API.md) | Stack, system and module architecture, security, API standards and full endpoint catalogue |
| 4 | [SPRINT_BACKLOG.md](SPRINT_BACKLOG.md) | Definition of Done, sprint stories with acceptance criteria, financial test pack |

## Supporting documents (to be written)

| Document | Purpose | Needed by |
|---|---|---|
| ACCOUNTING_RULES.md | Full calculation and rounding rules, P&L treatment | Sprint 4 |
| TAX_RULES_UAE.md | UAE VAT codes, invoice requirements, adviser sign-off | Sprint 2 (draft), Sprint 10 (signed) |
| SECURITY.md | Threat model, access controls, incident response | Sprint 1 |
| TEST_PLAN.md | QA strategy, traceability matrix, UAT scripts | Sprint 4 |
| [CHANGELOG.md](../CHANGELOG.md) | Release history and approved change requests | Started |
| [adr/](adr/README.md) | Architecture decision records: 0001–0003 accepted | Done |

## Sprint 0 decisions

Listed in PRD §7. The ones that blocked Sprint 0 are now accepted:

- **D-01** ORM: Drizzle — accepted ([ADR-0001](adr/0001-orm-drizzle.md)).
- **D-02** Auth provider: Firebase Auth — accepted ([ADR-0002](adr/0002-auth-firebase.md)).
- **D-03** Object storage: AWS S3 in me-central-1 — accepted ([ADR-0003](adr/0003-object-storage-s3-uae.md)).

## Rule

The approved PRD and architecture are the source of truth. Business rules, database structures, financial calculations and security policies change only through an approved change request (PRD §8).
