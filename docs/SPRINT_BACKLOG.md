# Invoiceflow — Development Sprint Backlog and Acceptance Criteria

| | |
|---|---|
| **Document** | Master Document 4 of 4 |
| **Version** | 1.0 |
| **Method** | Scrum, 2-week sprints (Sprint 0 = 1 week) |
| **Related** | [PRD.md](PRD.md) · [DATABASE_ERD.md](DATABASE_ERD.md) · [ARCHITECTURE_AND_API.md](ARCHITECTURE_AND_API.md) |

Story IDs are `S<sprint>-<n>`. "Req" links to PRD requirement IDs. 🧑‍⚖️ = requires human review before merge (migrations, money/tax maths, auth, RLS, permissions).

---

## 1. Definition of Ready

A story enters a sprint only when it has: linked PRD requirement(s), acceptance criteria, approved schema impact (if any), UX wireframe (if UI), and test data defined.

## 2. Definition of Done

A feature is **not** done because an AI agent generated code. Every story must have:

1. Approved requirements.
2. Approved database changes (migration reviewed 🧑‍⚖️).
3. Backend implementation.
4. Mobile integration (where UI applies).
5. Input validation.
6. Permission validation (positive and negative tests).
7. Tenant isolation validation (cross-tenant test).
8. Unit tests (≥ 80% line coverage on services; 100% on calculation modules).
9. Integration tests against real Postgres with RLS on.
10. UAT by product owner.
11. Documentation (OpenAPI, relevant `.md` updated).
12. Code review.
13. Successful staging deployment.

## 3. Cross-cutting acceptance criteria (apply to every API story)

- **XC-1** Request without token → 401. Valid token, no membership of `X-Tenant-Id` → 403 `TENANT_ACCESS_DENIED`.
- **XC-2** Tenant A requesting Tenant B's resource id → 404 (not 403). Listing never returns B's rows.
- **XC-3** Missing permission → 403 `PERMISSION_DENIED`.
- **XC-4** Suspended tenant → reads 200, writes 402 `SUBSCRIPTION_INACTIVE`.
- **XC-5** Mutations write exactly one audit row with no secrets.
- **XC-6** Money fields are decimal strings in JSON.
- **XC-7** Posting endpoints: replaying the same `Idempotency-Key` returns the original response and creates nothing new.

---

## Sprint 0 — Project foundation (Week 1)

**Goal:** running skeleton and pipeline.

| ID | Story / Task | Acceptance criteria |
|---|---|---|
| S0-1 | Create GitHub monorepo `invoiceflow` (`apps/api`, `apps/mobile`, `apps/admin`, `packages/`, `docs/`) | Repo exists; branch protection on `main`/`develop`; CODEOWNERS routes `migrations/`, `posting/`, `auth/`, `tax/` to tech lead |
| S0-2 | Branch strategy + PR template + commit conventions | Documented in `CONTRIBUTING.md`; PR template has DoD checklist and 🧑‍⚖️ checkbox |
| S0-3 | Coding standards: ESLint, Prettier, `strict` TS, `dart analyze` rules | CI fails on lint error |
| S0-4 | NestJS skeleton with `/health` and `/health/db` | `GET /health` → 200; `/health/db` runs `SELECT 1` on Neon |
| S0-5 | Flutter skeleton with bottom nav shell and env flavours (dev/staging/prod) | App launches on emulator and a physical Android device |
| S0-6 | Next.js admin skeleton | Builds and serves a login placeholder |
| S0-7 | Neon dev project + Drizzle config + first empty migration | Migration runs in CI against ephemeral Neon branch |
| S0-8 | GitHub Actions: lint, typecheck, test, build API, build APK, build admin | All green on `develop` |
| S0-9 | Issue tracker with epics per module and this backlog imported | Board visible to team |
| S0-10 | Decide D-01 (ORM), D-02 (auth), D-03 (storage) | Decisions recorded in `docs/adr/` |

**Sprint acceptance:** Flutter app launches · backend health check 200 · DB connection works · automated build succeeds.

---

## Sprint 1 — Database and authentication (Weeks 2–3)

**Goal:** secure login, tenant creation and isolation. All stories 🧑‍⚖️.

| ID | Story | Req | Acceptance criteria |
|---|---|---|---|
| S1-1 | Core migrations: tenants, users, memberships, roles, permissions, role_permissions, tenant_settings, audit_logs, idempotency_keys | §4.1 ERD | Migration up/down clean; seeds load permissions + 6 system roles |
| S1-2 | As a new user I can register with email/password | AUTH-001, AUTH-004 | Given a new email, when I register, then a user row exists and a verification email is sent. Duplicate email → 409. Weak password rejected with message. |
| S1-3 | As a user I can log in and out | AUTH-002, AUTH-005 | Valid creds → token; `GET /auth/me` returns profile + memberships. Logout revokes refresh; old refresh fails. 10 failed attempts/min/IP → 429. |
| S1-4 | As a user I can reset my password | AUTH-003 | Forgot-password always 200. Link expires (≤ 1 h) and is single-use. |
| S1-5 | As a user I can create a business | TEN-001 | `POST /tenants` creates tenant + Owner membership + default settings in one transaction. Failure leaves nothing behind. |
| S1-6 | Tenant resolution guard + transaction-local context | §3.1 Arch | `set_config(..., true)` used; test proves a pooled connection reused after request A has no tenant context in request B. |
| S1-7 | RLS on all tenant tables | NFR-001 | Automated test lists all tables with `tenant_id` and asserts RLS enabled + forced + policy present. App role is `NOBYPASSRLS`. |
| S1-8 | Permission guard using codes | ROLE-001 | Endpoint decorated `invoice.issue` rejects a Sales User whose role lacks it; adding the permission to the role grants access on next request. |
| S1-9 | Cross-tenant test harness | XC-1/2 | Reusable fixture creates Tenant A and B; template test proves read/update/delete across tenants fail for one sample entity. |
| S1-10 | Audit interceptor | AUD-001–003 | Mutations produce audit rows; password/token fields redacted; app role cannot UPDATE/DELETE `audit_logs`. |
| S1-11 | Mobile: register, login, verify-email, forgot-password screens | UX-005 | Validation messages per field; token in secure storage; logout clears it. |

**Sprint acceptance:** register ✓ · login ✓ · tenant created ✓ · membership validated ✓ · cross-tenant tests pass ✓.

---

## Sprint 2 — Onboarding and settings (Weeks 4–5)

| ID | Story | Req | Acceptance criteria |
|---|---|---|---|
| S2-1 | Onboarding wizard: business details | TEN-002, TEN-003 | Steps: legal/trading name → address (emirate picker) → contact. Progress saved per step; resume after app kill. |
| S2-2 | Financial year and currency | TEN-004, TEN-005 | FY start month selectable; base currency AED preselected and locked after first posting. |
| S2-3 | VAT registration setup 🧑‍⚖️ | TEN-006, TEN-007, VAT-001 | Not registered → no TRN, sales default `OS`. Registered → TRN required, must be 15 digits; reporting frequency + period start captured. |
| S2-4 | Tax codes and rates seed 🧑‍⚖️ | VAT-002, VAT-003 | `tax_codes` + `tax_rates` seeded for AE; 5% rate effective-dated; no `0.05` literal in code (grep check in CI). |
| S2-5 | Document numbering configuration | TEN-008 | Owner sets prefix/next number/padding per type; next number cannot be set below highest used; preview shows `INV-00001`. |
| S2-6 | Company logo upload | TEN-009 | PNG/JPG ≤ 2 MB; uses document upload flow; displayed on settings screen. |
| S2-7 | Default data creation | TEN-010 | New tenant gets: default Cash account, expense categories, tax settings, numbering rows. Idempotent if re-run. |
| S2-8 | Business settings screen (edit after onboarding) | TEN-002–009 | Changes persist and are audited. |
| S2-9 | Tenant switcher | TEN-011 | User with 2 memberships can switch; all data reloads for selected tenant; last-used tenant remembered. |
| S2-10 | User invitation and role assignment | ROLE-002, ROLE-003 | Owner invites by email with role; invite expires in 7 days; accepting creates membership; last Owner cannot be demoted. |

**Sprint acceptance:** tenant completes onboarding · non-VAT and VAT-registered tenants configurable · settings persist.

---

## Sprint 3 — Customers, suppliers and products (Weeks 6–7)

| ID | Story | Req | Acceptance criteria |
|---|---|---|---|
| S3-1 | Customer CRUD | CUS-001, CUS-002 | Create/edit/list/detail; code auto-generated and unique per tenant; same code allowed in another tenant. |
| S3-2 | Customer duplicate warning | CUS-008 | Matching name (case-insensitive), email or TRN shows warning with link to existing; user can proceed. |
| S3-3 | Customer search and filters | CUS-007 | Search by name/code/phone/email/TRN returns in < 500 ms for 10k customers; filter by status. |
| S3-4 | Customer opening balance 🧑‍⚖️ | CUS-003 | Creates an `opening_balance` invoice with as-of date, no VAT; appears in ageing and statement; once allocated, cannot be changed. |
| S3-5 | Customer deactivation | CUS-009 | Customer with posted docs: delete blocked, deactivate allowed; inactive customers hidden from pickers but visible in reports. |
| S3-6 | Supplier CRUD, search, duplicates, opening balance, deactivation | SUP-001–008 | Same criteria as S3-1…S3-5 for suppliers. |
| S3-7 | Items CRUD | ITM-001, ITM-002 | Product/service; price ≥ 0; default tax code from tenant's allowed codes; code unique per tenant. |
| S3-8 | Expense categories management | EXP-004 | Seeded defaults; tenant can add/rename/deactivate; system categories cannot be deleted. |
| S3-9 | Customer/supplier transaction view (shell) | CUS-004, SUP-004 | Screen lists documents (empty until later sprints) with filters wired. |
| S3-10 | Cross-tenant tests for all master data | XC-2 | Pass. |

**Sprint acceptance:** create/maintain records · duplicate checks work · tenant isolation works · search and filters work.

---

## Sprint 4 — Quotations and invoices (Weeks 8–9)

| ID | Story | Req | Acceptance criteria |
|---|---|---|---|
| S4-1 | Calculation engine 🧑‍⚖️ | INV-002, VAT-004 | Pure module; uses decimal arithmetic; passes **all** cases in Financial Test Pack §A (below); 100% branch coverage. |
| S4-2 | Quotation draft create/edit | QUO-001–003 | Lines with item picker pre-fill; line/doc discount; totals via `/quotations/calculate`; draft autosave. |
| S4-3 | Quotation lifecycle | QUO-005, QUO-006 | Send assigns number; accept/reject from Sent only; nightly job expires Sent past expiry; invalid transitions → 409. |
| S4-4 | Quotation → invoice conversion 🧑‍⚖️ | QUO-007, QUO-008 | Accepted quotation converts to Draft invoice copying lines and linking `quotation_id`. Second convert (including concurrent double-tap) → 409 `DUPLICATE`; only one invoice exists. |
| S4-5 | Invoice draft create/edit/delete | INV-001, INV-013 | Due date = invoice date + customer terms (editable, ≥ invoice date). Drafts have no number, can be deleted. |
| S4-6 | Issue invoice 🧑‍⚖️ | INV-004–006, §8.6 Arch | Server recalculates (client totals ignored); number allocated sequentially; 50 concurrent issues produce 50 unique, gapless numbers; snapshots stored; issued invoice PATCH → 409; `tax_transaction_lines` written. |
| S4-7 | Cancel invoice 🧑‍⚖️ | INV-007 | Allowed only with no allocations/credits; reason required; reverses tax lines (negative entries); number retained; audited. |
| S4-8 | Credit notes 🧑‍⚖️ | INV-012 | Credit ≤ invoice total − credited − paid (else 422); issuing reduces `balance_due` and output VAT; own numbering sequence. |
| S4-9 | PDF generation for quotation, invoice, credit note | QUO-004, INV-008 | Tax invoice layout for VAT-registered (title, TRNs, VAT per line); plain invoice otherwise; amounts match DB to the fils; Arabic customer names render. |
| S4-10 | Share PDF | QUO-004, INV-008 | Android share sheet with PDF attachment. |
| S4-11 | Mobile: invoice list with status badges and search by number | UX-007, UX-008 | Draft vs Issued visually distinct; overdue derived and shown; search by `INV-…` finds it. |
| S4-12 | UX timing test | UX-002 | Product owner creates and issues a 2-line invoice for existing customer/items in < 60 s. |

**Sprint acceptance:** calculations match test cases · tax treatment correct · conversion without duplication · issued documents keep audit history · PDFs correct.

---

## Sprint 5 — Receipts and customer balances (Weeks 10–11)

| ID | Story | Req | Acceptance criteria |
|---|---|---|---|
| S5-1 | Bank/cash accounts minimal (needed for receipts) | BNK-001 | Create bank and cash accounts with opening balance (full banking in S7). |
| S5-2 | Create receipt with allocations 🧑‍⚖️ | RCP-001, RCP-002, RCP-005 | Receipt 600 against invoice 1,050 → invoice `partially_paid`, balance 450, bank +600, all in one tx. |
| S5-3 | Allocation limits 🧑‍⚖️ | RCP-004 | Allocation > invoice balance → 422; Σ allocations > receipt amount → 422; zero/negative → 400; two concurrent receipts against same invoice cannot over-allocate. |
| S5-4 | Advance / unallocated receipts | RCP-003 | Receipt with no allocations stored as customer credit; later `allocate` applies it; customer balance reflects credit. |
| S5-5 | Duplicate posting prevention | RCP-006, XC-7 | Same Idempotency-Key twice → one receipt; network-retry simulation passes. |
| S5-6 | Void receipt 🧑‍⚖️ | RCP-009 | Reverses allocations, invoice status/balance, bank transaction (reversal row); reason required; receipt number retained. |
| S5-7 | Customer outstanding & ageing | CUS-005, RPT-102 | Buckets Current/1–30/31–60/61–90/90+; Σ buckets = customer balance. |
| S5-8 | Customer statement (screen + PDF) | CUS-006 | Opening balance at `from`, chronological invoices/credits/receipts with running balance, closing balance = ledger balance at `to`. |
| S5-9 | Receipt PDF and history | RCP-007, RCP-008 | PDF shows allocations; history lists per customer. |
| S5-10 | "Record payment" shortcut from invoice | INV-009 | Opens receipt pre-filled with customer and invoice balance. |

**Sprint acceptance:** full and partial payments work · allocations cannot exceed available amounts · outstanding balances reconcile · duplicate posting prevented.

---

## Sprint 6 — Purchases and expenses (Weeks 12–13)

| ID | Story | Req | Acceptance criteria |
|---|---|---|---|
| S6-1 | Purchase bill draft/post/void 🧑‍⚖️ | PUR-001, PUR-003 | Lines by item or category; server totals; post assigns internal reference and writes input tax lines (recoverable vs non-recoverable per code). |
| S6-2 | Supplier invoice duplicate check | PUR-002 | Same supplier + same supplier invoice no. → warning on draft, 409 on post. |
| S6-3 | Supplier payments with allocations 🧑‍⚖️ | PUR-005, PUR-006 | Mirrors S5-2…S5-6 (limits, idempotency, void) for bills; bank −amount. |
| S6-4 | Expense quick entry 🧑‍⚖️ | EXP-001, EXP-002, EXP-005, EXP-006 | ≤ 4 primary inputs (amount, category, account, date defaulted to today); VAT-inclusive toggle computes net/VAT; posting creates bank transaction. |
| S6-5 | Attachments for bills and expenses | PUR-004, EXP-003 | PDF/JPG/PNG ≤ 10 MB, multiple; wrong magic bytes rejected; camera capture on Android. |
| S6-6 | Attachment access control | §6.1 Arch | User from Tenant B cannot get a download URL for A's document (404); signed URL expires in 5 min; user without `document.view` → 403. |
| S6-7 | Supplier balances, ageing, statement | SUP-005, SUP-006 | As S5-7/S5-8 for suppliers. |
| S6-8 | Expense void | EXP-002 | Reverses bank transaction and tax lines; audited. |

**Sprint acceptance:** purchase totals correct · VAT recorded correctly · attachments only for authorised users · supplier balances reconcile.

---

## Sprint 7 — Banking and cash management (Weeks 14–15)

| ID | Story | Req | Acceptance criteria |
|---|---|---|---|
| S7-1 | Full account management | BNK-001 | Edit/deactivate; account number stored masked only; cannot deactivate with non-zero balance without confirmation. |
| S7-2 | Deposits and withdrawals 🧑‍⚖️ | BNK-002 | Manual entries with description/reference; reversible via reversal entry (no edits). |
| S7-3 | Transfers 🧑‍⚖️ | BNK-003 | Creates transfer + `transfer_out` + `transfer_in` atomically; same source/destination rejected; void reverses both. |
| S7-4 | Balances computed 🧑‍⚖️ | BNK-005 | Balance = opening + Σ(direction × amount); matches across list, detail, dashboard and statement. |
| S7-5 | Account transactions with running balance | BNK-006 | Date-filtered; running balance correct across pages. |
| S7-6 | Account statement export | BNK-007 | PDF and XLSX totals equal screen totals. |
| S7-7 | Duplicate prevention | Integrity #10 | Unique `(source_type, source_id, transaction_type)` blocks a second bank txn for the same receipt/payment/expense. |
| S7-8 | Banking tab UI | §5 PRD | Accounts with balances, transactions, transfer action. |

**Sprint acceptance:** balances reconcile to transactions · transfers create both sides · duplicates prevented.

---

## Sprint 8 — VAT and reporting (Weeks 16–17)

| ID | Story | Req | Acceptance criteria |
|---|---|---|---|
| S8-1 | VAT summary 🧑‍⚖️ | VAT-006, VAT-007, RPT-010 | For a period: standard-rated sales & output VAT, zero-rated, exempt, out-of-scope, input VAT recoverable/non-recoverable, net payable/refundable. Built only from `tax_transaction_lines`. Credit notes reduce output VAT in the period they're issued. |
| S8-2 | Transaction-level tax report | VAT-007 | Every line in S8-1 traceable to a document; Σ detail = summary. |
| S8-3 | Sales, quotations, collections reports | RPT-001–003 | Filters per PRD; posted only (quotations: all statuses). |
| S8-4 | Purchases and expenses reports | RPT-005, RPT-006 | Filters per PRD. |
| S8-5 | Receivables and payables ageing | RPT-004, RPT-007 | As-of date; buckets; Σ = control balance. |
| S8-6 | Cash and bank reports | RPT-008, RPT-009 | Match S7 balances. |
| S8-7 | Management P&L 🧑‍⚖️ | RPT-011, BKP-004 | Income = issued invoices net of VAT − credit notes; expenses = posted bills (net, excl. recoverable VAT; non-recoverable VAT included) + posted expenses, grouped by category. Labelled "Management estimate". |
| S8-8 | Dashboard | DSH-001–005 | Figures equal the corresponding reports for the same period; drafts excluded; drill-down works. |
| S8-9 | PDF and Excel export for all reports | RPT-101 | Exported totals equal on-screen; >5,000 rows run async. |
| S8-10 | Report performance | NFR-003 | 10k-row report < 2 s p95 on staging dataset. |

**Sprint acceptance:** reports reconcile to transactions · VAT classifications correct · exports equal screen · filters work.

---

## Sprint 9 — Super Admin and subscriptions (Weeks 18–19)

| ID | Story | Req | Acceptance criteria |
|---|---|---|---|
| S9-1 | Admin login with MFA 🧑‍⚖️ | §2.1 PRD | Separate auth audience; tenant tokens rejected on admin API and vice versa; MFA mandatory. |
| S9-2 | Tenant management | — | List/search/filter; view detail requires reason → audit row; suspend/reactivate with reason. |
| S9-3 | Plans and features | SUB-001, SUB-002 | CRUD plans and feature limits; retired plans not offered to new tenants. |
| S9-4 | Trial lifecycle | SUB-003 | New tenant starts `trialing` with plan trial days; on expiry → `past_due` with grace → `suspended`; job is idempotent. |
| S9-5 | Manual payment & activation | SUB-007 | Admin records payment → subscription `active`, period set; audited. |
| S9-6 | Suspension enforcement 🧑‍⚖️ | SUB-005, SUB-006 | Suspended tenant: login, view, export OK; any create/post → 402. Reactivation restores writes; no data lost. |
| S9-7 | Plan limits | SUB-002 | Inviting beyond `max_users` → 402 `PLAN_LIMIT_REACHED`; document/month limit enforced on issue. |
| S9-8 | Tenant subscription screen | SUB-008 | Shows plan, status, renewal, usage vs limits; change request notifies admin. |
| S9-9 | Platform dashboard and audit log viewer | §8.15 Arch | Counts by status, signups; audit log filterable. |

**Sprint acceptance:** admin manages tenants · trial expiry works · suspended tenants cannot create financial transactions · data preserved · platform actions audited.

---

## Sprint 10 — QA, security and UAT (Weeks 20–21)

| ID | Task | Acceptance criteria |
|---|---|---|
| S10-1 | Full functional regression | All P0 requirements have a passing test case in TEST_PLAN traceability matrix. |
| S10-2 | Financial test pack (manual + automated) | 100% pass; signed off by an accountant. |
| S10-3 | Tenant isolation suite | Every endpoint exercised cross-tenant (automated from OpenAPI); 0 leaks. |
| S10-4 | Permission matrix tests | Every permission code: allowed role passes, disallowed role 403. |
| S10-5 | API security testing | OWASP ASVS L2 checklist; external or tool-based pen test; no critical/high open. |
| S10-6 | Performance test | 200 concurrent users, p95 within NFR-003. |
| S10-7 | Device testing | Android 9–15, small/large screens, low-end device; no crash in core flows. |
| S10-8 | Backup and restore drill | Restore prod-like DB to a point in time; app verified against it; RTO/RPO recorded. |
| S10-9 | Tax adviser review | `TAX_RULES_UAE.md` and invoice layout signed off. |
| S10-10 | UAT | Product owner executes UAT scripts; signs off. |

**Sprint acceptance:** no open critical/high defects · financial test pack passes · cross-tenant tests pass · recovery validated · UAT signed.

---

## Sprint 11 — Google Play launch (Weeks 22–23+)

| ID | Task | Acceptance criteria |
|---|---|---|
| S11-1 | Play Console account (start in Sprint 0 — verification takes time) | Account verified |
| S11-2 | Store listing, screenshots, feature graphic | Approved assets in repo |
| S11-3 | Privacy policy, Data Safety form, account-deletion URL | Published URLs; Data Safety matches actual collection |
| S11-4 | Play App Signing, release keystore in secret manager | Signed AAB builds in CI |
| S11-5 | Internal → closed testing track | ≥ 20 testers for 14 days if required by Play policy for new personal accounts |
| S11-6 | Beta feedback triage | All beta-blocking issues fixed |
| S11-7 | Production submission and staged rollout (10% → 50% → 100%) | Approved; crash-free ≥ 99.5% at each stage |
| S11-8 | Production monitoring and support channel | Alerts live; support email/in-app help working |

---

## Sprint 12 — Stabilisation and iOS preparation

| ID | Task | Acceptance criteria |
|---|---|---|
| S12-1 | Launch feedback review and fixes | Top issues resolved |
| S12-2 | Performance and onboarding improvements | Onboarding completion ≥ 80% |
| S12-3 | iOS configuration (bundle id, signing, permissions strings) | Builds and runs on simulator and device |
| S12-4 | iOS layout and permission testing | Core flows pass on iPhone SE and Pro Max sizes |
| S12-5 | App Store submission package | Ready for review; scheduled after Android stabilises |

---

## 4. Financial test pack (seed for TEST_PLAN.md)

Tenant: VAT-registered, AED, SR = 5%. All amounts AED.

### A. Calculation cases (S4-1)

| # | Input | Expected |
|---|---|---|
| A1 | 1 × 1,000.00 SR | net 1,000.00 · VAT 50.00 · total 1,050.00 |
| A2 | 3 × 33.33 SR | gross 99.99 · VAT 5.00 (4.9995 → 5.00) · total 104.99 |
| A3 | 2 × 500.00, line discount 100.00, SR | net 900.00 · VAT 45.00 · total 945.00 |
| A4 | 1 × 1,000.00 ZR | VAT 0.00 · total 1,000.00 · reported as zero-rated |
| A5 | 1 × 1,000.00 EX | VAT 0.00 · reported as exempt |
| A6 | Mixed: 1 × 1,000 SR + 1 × 500 ZR | subtotal 1,500 · VAT 50 · total 1,550 |
| A7 | VAT-inclusive 105.00 SR | net 100.00 · VAT 5.00 |
| A8 | Non-registered tenant, 1 × 1,000 | VAT 0.00, code OS, no "Tax Invoice" title |
| A9 | Rate change: SR rate 5% until D, 6% from D+1 (test-only) | invoice dated D uses 5%, D+1 uses 6% |

### B. End-to-end scenario (S8 sign-off)

| Step | Transaction | Amount |
|---|---|---|
| B1 | Issue sales invoice, 1 × 1,000 SR | total 1,050 |
| B2 | Receipt against B1 to Bank | 600 |
| B3 | Post purchase bill, 1 × 200 SR (recoverable), unpaid | total 210 |
| B4 | Post expense 100, OS, from Cash | 100 |

**Expected reports for the period**

| Report | Expected |
|---|---|
| Sales | 1,000.00 |
| Output VAT | 50.00 |
| Collections | 600.00 |
| Receivables outstanding | 450.00 |
| Purchases | 200.00 (+ VAT 10.00) |
| Input VAT (recoverable) | 10.00 |
| Net VAT payable | 40.00 |
| Expenses | 100.00 |
| Payables outstanding | 210.00 |
| Bank balance | opening + 600.00 |
| Cash balance | opening − 100.00 |
| Management P&L | 1,000 − 200 − 100 = **700.00** |

### C. Negative cases

| # | Action | Expected |
|---|---|---|
| C1 | Allocate 500 to an invoice with balance 450 | 422 `ALLOCATION_EXCEEDS_BALANCE` |
| C2 | Issue the same draft twice concurrently | one succeeds, other 409 |
| C3 | Convert same quotation twice | second 409 |
| C4 | Credit note 1,100 against 1,050 invoice | 422 |
| C5 | Cancel invoice with receipt allocated | 409 `INVALID_STATE_TRANSITION` |
| C6 | Tenant B fetches Tenant A invoice | 404 |
| C7 | Suspended tenant creates invoice | 402 |
| C8 | Replay receipt POST with same Idempotency-Key | same response, one receipt |

> Simplified test pack. Actual tax classification and management-profit treatment follow the approved `ACCOUNTING_RULES.md` and `TAX_RULES_UAE.md`.

---

## 5. Key risks

| Risk | Mitigation | Owner |
|---|---|---|
| Incorrect financial calculations | Independent test pack, 100% coverage on calc module, accountant sign-off | Tech lead + accountant |
| Tenant data leakage | RLS + guards + composite FKs + automated cross-tenant suite + pen test | Tech lead |
| Scope expansion | P0/P1/P2 discipline; CR process | Product owner |
| AI-generated defects | 🧑‍⚖️ human review, CODEOWNERS, tests in DoD | Tech lead |
| Database redesign | Approved ERD; migration review | Tech lead |
| Tax compliance gaps | UAE tax adviser review before Sprint 10 exit | Product owner |
| Poor adoption | Prototype testing in Sprint 2–4 with 5 target users | Product owner |
| Infra cost | Neon autosuspend, budgets, usage alerts | DevOps |
| Play Store delays | Open developer account in Sprint 0; closed-testing requirement planned | Product owner |
| Data loss | PITR + logical backups + restore drill | DevOps |
