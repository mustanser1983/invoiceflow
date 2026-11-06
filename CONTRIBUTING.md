# Contributing to Invoiceflow

## Branches

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | Production. Only release and hotfix merges. | Production (manual approval on tag `v*`) |
| `develop` | Integration branch. Default target for feature PRs. | Development |
| `feature/<ticket>-<slug>` | One story or task, branched from `develop` | — |
| `release/<x.y>` | Release stabilisation, branched from `develop` | Staging |
| `hotfix/<slug>` | Urgent production fix, branched from `main`, merged to `main` and `develop` | — |

Never commit directly to `main` or `develop`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(invoices): issue invoice with server-side totals
fix(receipts): prevent over-allocation under concurrency
docs(prd): add D-13 decision
chore(ci): pin node version
```

Scopes match backend modules (`auth`, `tenants`, `invoices`, `receipts`, `tax`, …), app names (`mobile`, `admin`) or `db`, `ci`, `docs`.

## Pull requests

- Link the story ID (e.g. `S4-6`) and PRD requirement IDs.
- Complete the Definition of Done checklist in the PR template.
- CI must be green.
- **1 approval** for normal changes.
- **2 approvals, including the tech lead, and the `needs-human-review` label** for any change to:
  - database migrations
  - money, tax or rounding calculations
  - authentication, sessions or tokens
  - row-level security, tenant resolution or permissions
  - audit logging

AI coding agents may open PRs, but a human must review and merge them. Agents must not change business rules, schema, financial calculations or security policies without an approved change request.

## Change requests

Changes to approved requirements follow PRD §8: open an issue with the `change-request` label, reference affected requirement IDs, and get product-owner approval before implementation. The implementing PR updates the PRD version and `CHANGELOG.md`.

## Architecture decisions

Significant technical choices are recorded in [`docs/adr/`](docs/adr/) using the template there. An ADR moves from **Proposed** to **Accepted** only when the product owner and tech lead approve it.

## Code standards

- TypeScript `strict`; ESLint + Prettier; no `any` without a comment explaining why.
- Dart: `flutter analyze` clean; `dart format`.
- Money: decimal libraries only (`decimal.js`, Dart `decimal`). Never `number`/`double` for amounts.
- No hardcoded tax rates, role names or currency.
- Secrets never in code, logs or commits.
