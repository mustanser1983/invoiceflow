# Invoiceflow — Product Requirements Document (PRD)

| | |
|---|---|
| **Document** | Master Document 1 of 4 |
| **Version** | 1.0 (approved baseline) |
| **Status** | Approved – initial development specification |
| **Initial market** | United Arab Emirates |
| **Initial platform** | Android (Flutter) |
| **Future platforms** | iOS, tenant web portal |
| **Related documents** | [DATABASE_ERD.md](DATABASE_ERD.md) · [ARCHITECTURE_AND_API.md](ARCHITECTURE_AND_API.md) · [SPRINT_BACKLOG.md](SPRINT_BACKLOG.md) |

> **Source-of-truth rule.** This PRD and the approved architecture are the source of truth. AI coding agents must not change business rules, database structures, financial calculations or security policies without an approved change request (see §12).

---

## 1. Product overview

Invoiceflow is a multi-tenant, cloud-based accounting and business-management application that simplifies financial administration for small and medium-sized businesses. Businesses manage sales, quotations, invoices, collections, purchases, expenses, bank and cash accounts, VAT tracking and basic financial reporting from a simple mobile interface.

The product launches for UAE businesses. The architecture must support additional countries, currencies, tax regimes and regulatory requirements without redesign.

### 1.1 Product objectives

1. Make everyday accounting accessible to non-accountants.
2. Reduce the time required to prepare invoices and record expenses.
3. Maintain an accurate record of business income and expenditure.
4. Provide visibility over customer collections and supplier payments.
5. Simplify VAT tracking.
6. Provide meaningful financial reports.
7. Offer an affordable subscription-based SaaS product.
8. Establish an architecture that can grow into a complete double-entry accounting system.

### 1.2 Success metrics (MVP)

| Metric | Target |
|---|---|
| Onboarding completion without assistance | ≥ 80% of new registrations |
| Time to prepare a basic invoice (customer + item exist) | < 60 seconds |
| Expense recording | < 5 primary input steps |
| Financial test pack pass rate | 100% before every release |
| Cross-tenant data leakage incidents | 0 |
| Crash-free sessions (Android) | ≥ 99.5% |

### 1.3 Target customers

| Segment | Primary requirements |
|---|---|
| Freelancers | Quotations, invoices, receipts |
| Consultants | Service invoicing, expense tracking |
| Trading businesses | Sales, purchases, supplier balances |
| Small retailers | Products, invoices, cash management |
| Service companies | Customer management, expense tracking |
| Small professional firms | VAT summaries, management reports |

### 1.4 Design principles

- Mobile-first.
- Plain language rather than accounting terminology.
- Minimum steps per transaction; no unnecessary data entry.
- Consistent UX across screens.
- Clear distinction between **draft** and **posted/issued** transactions.
- Fast search and retrieval by reference number.
- Secure access to financial information.
- Expandable without redesigning the database.

### 1.5 Scope summary

| In MVP (P0) | Deferred |
|---|---|
| Auth, tenant onboarding, roles & permissions | Full double-entry ledger, trial balance, balance sheet (V2) |
| Customers, suppliers, items | Inventory and stock valuation (V3) |
| Quotations, invoices, credit notes | Bank reconciliation, bank feeds (P1/P2) |
| Receipts and allocations | Payment-gateway subscription billing (P1) |
| Purchase bills, supplier payments, expenses | Custom report builder (P1) |
| Bank & cash accounts, transfers | Multi-currency documents (later) |
| UAE VAT configuration and summaries | FTA return submission / e-invoicing (V4) |
| Standard reports with PDF/Excel export | iOS app, tenant web portal (V4) |
| Subscriptions (manual activation), Super Admin portal | AI scanning / assistant (V3+) |
| Audit logs | Multi-branch (V3) |

---

## 2. User roles and access rights

### 2.1 Platform role

**Super Admin** (platform staff; separate authentication realm from tenant users)
- Platform administration; manage all tenants.
- Create and modify subscription plans; activate and suspend subscriptions.
- Configure available features per plan.
- View platform-level statistics.
- Manage custom report templates (P1).
- Access tenant support tools — every access to tenant data is audited.

### 2.2 Tenant roles (default system templates)

| Role | Default scope |
|---|---|
| **Tenant Owner** | Full access; manages business configuration, users, permissions and subscription. Every tenant has at least one Owner. |
| **Tenant Administrator** | Day-to-day settings, users and transactions. No platform-level settings. Cannot remove the last Owner. |
| **Accountant** | Financial transactions and reports; review and correct permitted transactions. |
| **Sales User** | Customers, quotations, invoices, sales reports where permitted. |
| **Purchase User** | Suppliers, purchase bills, expenses, supporting documents. |
| **Cashier** | Receipts, collections, cash and bank transactions as authorised. |

**Rules**
- **ROLE-001** Permissions are configurable per tenant. Role names are never hardcoded into business logic; code checks **permission codes** only (e.g. `invoice.issue`).
- **ROLE-002** System role templates are seeded; tenants may create custom roles from the permission catalogue.
- **ROLE-003** A user may belong to multiple tenants with a different role in each.
- **ROLE-004** Permission changes take effect on the user's next request (no stale cached grants beyond token lifetime).

---

## 3. Functional requirements

**Priority:** **P0** mandatory for MVP · **P1** important, may follow launch · **P2** future.

### 3.1 Registration and onboarding — P0

| ID | Requirement |
|---|---|
| AUTH-001 | User can register with email and password. |
| AUTH-002 | User can securely log in and log out. |
| AUTH-003 | Password reset via emailed, time-limited link. |
| AUTH-004 | Email verification before a tenant can issue financial documents. |
| AUTH-005 | Session refresh without re-entering credentials; revocation on logout. |
| TEN-001 | Create a business tenant during registration. |
| TEN-002 | Enter legal name and trading name. |
| TEN-003 | Enter UAE address (emirate, city, address lines, PO box) and contact details. |
| TEN-004 | Configure financial year start month. |
| TEN-005 | Base currency defaults to AED. |
| TEN-006 | Configure VAT registration status. |
| TEN-007 | Enter VAT TRN when registered (15-digit format validation). |
| TEN-008 | Configure document numbering (prefix, next number, padding) per document type. |
| TEN-009 | Upload company logo (PNG/JPG, size-limited). |
| TEN-010 | Default business settings, tax codes, expense categories and a default Cash account are created automatically. |
| TEN-011 | A user can create or be invited to additional tenants and switch between them. The system never assumes one user = one tenant. |

### 3.2 Dashboard — P0

| ID | Requirement |
|---|---|
| DSH-001 | Show for the selected period: sales, collections, outstanding customer invoices, purchases and expenses, supplier outstanding, cash balance, bank balance, estimated management profit. |
| DSH-002 | Filters: Today, This week, This month, This quarter, This year, Custom range. |
| DSH-003 | All figures are calculated from **posted** transactions only; drafts are excluded. |
| DSH-004 | Each figure drills down to the underlying report. |
| DSH-005 | Quick actions: New invoice, New receipt, New expense, New quotation. |

### 3.3 Customer management — P0

| ID | Requirement |
|---|---|
| CUS-001 | Create and edit customers: name, contact person, email, phone, address, TRN (optional), payment terms. |
| CUS-002 | Customer code auto-generated, editable, unique per tenant. |
| CUS-003 | Opening balance with as-of date (recorded as an opening-balance document, not a free-text field). |
| CUS-004 | Customer transaction history (invoices, credit notes, receipts). |
| CUS-005 | Outstanding invoices list with ageing. |
| CUS-006 | Customer statement for a date range (PDF). |
| CUS-007 | Search by name, code, phone, email, TRN; filter by status and balance. |
| CUS-008 | Duplicate warning on matching name, email or TRN. |
| CUS-009 | Customers with posted transactions can be deactivated but not deleted. |

### 3.4 Supplier management — P0

| ID | Requirement |
|---|---|
| SUP-001 | Create and edit suppliers: name, contact details, address, TRN (optional), payment terms. |
| SUP-002 | Supplier code unique per tenant. |
| SUP-003 | Opening balance with as-of date. |
| SUP-004 | Purchase and payment history. |
| SUP-005 | Outstanding supplier bills with ageing. |
| SUP-006 | Supplier statement for a date range (PDF). |
| SUP-007 | Search, filters and duplicate warning as for customers. |
| SUP-008 | Suppliers with posted transactions can be deactivated but not deleted. |

### 3.5 Products and services — P0

| ID | Requirement |
|---|---|
| ITM-001 | Fields: name, description, SKU/service code, type (product/service), unit, selling price, default purchase cost (optional), default tax code, active/inactive. |
| ITM-002 | Item code unique per tenant. |
| ITM-003 | Item defaults pre-fill document lines; the user may override price, description and tax code on the line. |
| ITM-004 | Changing an item never changes existing documents (lines are snapshots). |
| ITM-005 | Stock tracking and inventory valuation are **excluded** from MVP. |

### 3.6 Quotations — P0

| ID | Requirement |
|---|---|
| QUO-001 | Create quotation: customer, date, expiry date, lines (item, description, qty, unit price, discount, tax code). |
| QUO-002 | Line and document discounts; tax calculated server-side. |
| QUO-003 | Terms and conditions (tenant default, editable per quotation). |
| QUO-004 | Generate and share PDF. |
| QUO-005 | Status lifecycle: `Draft → Sent → Accepted / Rejected / Expired → Converted`. |
| QUO-006 | Expiry is applied automatically after the expiry date for Sent quotations. |
| QUO-007 | Convert an Accepted quotation into a Draft invoice, preserving the quotation reference. |
| QUO-008 | A quotation can be converted **once**; duplicate conversion is rejected (DB-enforced). |
| QUO-009 | Quotations are not financial postings and never affect balances or VAT. |

### 3.7 Sales invoices and credit notes — P0

| ID | Requirement |
|---|---|
| INV-001 | Create invoice: customer, invoice date, due date (from payment terms, editable), lines, notes. |
| INV-002 | Server calculates subtotal, discounts, VAT per line and total. Client values are display-only. |
| INV-003 | Statuses: `Draft, Issued, Partially Paid, Paid, Overdue, Cancelled`. |
| INV-004 | Invoice number is assigned **at issue**, from the tenant sequence, gap-controlled and unique. Drafts have no number. |
| INV-005 | Issuing snapshots customer details, tax rates and seller TRN onto the document. |
| INV-006 | Issued invoices are immutable. Corrections are made via credit note or cancellation. |
| INV-007 | Cancellation is allowed only when no receipts or credit notes are allocated; it is audited and requires a reason. |
| INV-008 | Generate and share PDF; VAT-registered tenants produce a "Tax Invoice" layout. |
| INV-009 | Record payment from the invoice (shortcut to receipt with allocation). |
| INV-010 | Partial payments supported; `amount_paid` and `balance_due` always reconcile to allocations and credits. |
| INV-011 | Overdue is derived: Issued/Partially Paid with `due_date < today` and `balance_due > 0`. |
| INV-012 | Credit notes: linked to an issued invoice, have their own number and lines, cannot exceed the invoice's remaining creditable amount, reduce balance due and output VAT. |
| INV-013 | Drafts are autosaved and recoverable after an interrupted session. |

### 3.8 Receipts and collections — P0

| ID | Requirement |
|---|---|
| RCP-001 | Create receipt: customer, date, method (Cash, Bank transfer, Card, Cheque, Other), bank/cash account, amount, reference. |
| RCP-002 | Allocate to one or more issued invoices, fully or partially. |
| RCP-003 | Unallocated remainder is held as customer advance/credit and can be allocated later. |
| RCP-004 | Allocations cannot exceed the receipt's unallocated amount or the invoice's balance due; no negative allocations. |
| RCP-005 | Posting a receipt creates the matching bank/cash transaction atomically. |
| RCP-006 | Duplicate posting is prevented by an idempotency key on create. |
| RCP-007 | Receipt PDF. |
| RCP-008 | Customer receipt history. |
| RCP-009 | A posted receipt can be voided (reverses allocations and the bank transaction); it cannot be edited or deleted. |

### 3.9 Purchases, supplier payments and expenses — P0

| ID | Requirement |
|---|---|
| PUR-001 | Purchase bill: supplier, supplier invoice number, internal reference, bill date, due date, lines (category or item, description, qty, unit price, discount, tax code), totals. |
| PUR-002 | Warn on duplicate supplier invoice number for the same supplier. |
| PUR-003 | Bill statuses: `Draft, Posted, Partially Paid, Paid, Overdue, Void`. |
| PUR-004 | Attach supplier invoice (PDF/JPG/PNG, multiple). |
| PUR-005 | **Supplier payments**: record payment against one or more bills, partial allowed, linked to a bank/cash account. |
| PUR-006 | Supplier payment rules mirror receipt rules (RCP-004 – RCP-006, RCP-009). |
| EXP-001 | Expense: category, description, date, amount, tax code, VAT amount, payment method, bank/cash account, optional supplier. |
| EXP-002 | Expenses are paid at the point of recording and create a bank/cash transaction on posting. |
| EXP-003 | Attach receipts (PDF/JPG/PNG, multiple). |
| EXP-004 | Expense categories are tenant-configurable, with defaults seeded. |
| EXP-005 | Expense entry is achievable in fewer than five primary input steps. |
| EXP-006 | Amount entry supports VAT-inclusive and VAT-exclusive modes. |

### 3.10 Banking and cash — P0

| ID | Requirement |
|---|---|
| BNK-001 | Create bank accounts and cash accounts (name, bank, masked account number/IBAN, currency, opening balance + date). |
| BNK-002 | Record deposits and withdrawals (manual bank transactions). |
| BNK-003 | Transfers between accounts create both sides atomically. |
| BNK-004 | Receipts, supplier payments and expenses link to and update accounts automatically. |
| BNK-005 | Account balance = opening balance + Σ posted transactions. Never stored as an editable field. |
| BNK-006 | Account transaction list with running balance and date filter. |
| BNK-007 | Export account statement (PDF/Excel). |
| BNK-008 | Bank reconciliation (P1) and direct bank feeds (P2) are out of MVP scope. |

### 3.11 VAT management — P0

| ID | Requirement |
|---|---|
| VAT-001 | Tenant VAT registration status and TRN. |
| VAT-002 | Tax treatments: Standard-rated, Zero-rated, Exempt, Out-of-scope; input VAT recoverable / non-recoverable. |
| VAT-003 | Rates are data, effective-dated, with UAE standard 5% as the seeded default. Never hardcoded. |
| VAT-004 | Every posted line stores its tax code, rate and amount as a snapshot. |
| VAT-005 | Non-VAT-registered tenants cannot charge output VAT; documents show no VAT. |
| VAT-006 | Configurable VAT reporting periods (monthly / quarterly, with start month). |
| VAT-007 | Reports: sales VAT summary, purchase VAT summary, output VAT, input VAT, net payable/refundable, taxable/zero-rated/exempt sales, transaction-level tax report. |
| VAT-008 | MVP produces management and reconciliation summaries; it does **not** file returns with the FTA. |
| VAT-009 | Tax calculations, document requirements and return classifications must be validated by a UAE tax adviser before production (see `TAX_RULES_UAE.md`). |

### 3.12 Basic bookkeeping — P0

| ID | Requirement |
|---|---|
| BKP-001 | Maintain sales, purchase, expense, receipt and payment registers. |
| BKP-002 | Maintain customer, supplier, bank and cash balances derived from posted documents. |
| BKP-003 | Income and expense categorisation. |
| BKP-004 | Every posting is a discrete, auditable event so a double-entry engine can be attached later without data migration of business documents. |

> **Reporting limitation.** MVP profit is a *management estimate* from recorded income and expenditure. It is not statutory accrual profit. Balance sheet, trial balance and general ledger are deferred to V2.

### 3.13 Standard reports — P0

| ID | Report | Filters |
|---|---|---|
| RPT-001 | Sales | Date, customer, invoice |
| RPT-002 | Quotations | Date, customer, status |
| RPT-003 | Collections | Date, customer, payment method |
| RPT-004 | Outstanding receivables | Customer, ageing bucket, due date |
| RPT-005 | Purchases | Date, supplier, category |
| RPT-006 | Expenses | Date, category |
| RPT-007 | Outstanding payables | Supplier, ageing bucket |
| RPT-008 | Cash | Account, date |
| RPT-009 | Bank | Account, date |
| RPT-010 | VAT summary | Tax period, tax code |
| RPT-011 | Management P&L | Period, income/expense category |
| RPT-012 | Customer statement | Customer, date range |
| RPT-013 | Supplier statement | Supplier, date range |

- **RPT-100** All reports support date filters, search, sorting and pagination.
- **RPT-101** All reports export to PDF and Excel; exported figures equal on-screen figures.
- **RPT-102** Ageing buckets: Current, 1–30, 31–60, 61–90, 90+ days past due.

### 3.14 Custom reporting — P1

| ID | Requirement |
|---|---|
| CRP-001 | Super Admin defines report templates: name, data source, columns, filters, grouping, sorting, calculated fields, export format, tenant access. |
| CRP-002 | Data sources are whitelisted views; no free-form SQL. Tenant isolation is enforced by the same RLS as standard reports. |

### 3.15 Subscription management — P0

| ID | Requirement |
|---|---|
| SUB-001 | Plans: Free Trial, Starter, Professional, Enterprise; monthly and annual pricing. |
| SUB-002 | Plan features and limits (users, documents/month, storage) are data-driven. |
| SUB-003 | Trial expiry, renewal date, payment status, grace period. |
| SUB-004 | States: `Trialing, Active, Past Due (grace), Suspended, Cancelled`. |
| SUB-005 | Suspended tenants can log in and **read/export** data but cannot create or post financial transactions. |
| SUB-006 | Reactivation restores full access; no data is lost on suspension. |
| SUB-007 | MVP: manual activation and payment confirmation by Super Admin. Payment gateway is P1. |
| SUB-008 | Owners see plan, status, limits usage and renewal date in the app. |

### 3.16 Audit and activity logs — P0

| ID | Requirement |
|---|---|
| AUD-001 | Record user, tenant, action, entity type, entity id/reference, before/after values where appropriate, timestamp, request id, IP/user agent. |
| AUD-002 | Audit logs are append-only (no update/delete at DB-permission level). |
| AUD-003 | Passwords, tokens, secrets and full bank account numbers are never logged. |
| AUD-004 | Super Admin access to tenant data is logged with a reason. |
| AUD-005 | Owners/Admins can view the tenant activity log. |

---

## 4. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-001 | Security | Tenant isolation enforced in backend **and** PostgreSQL RLS. |
| NFR-002 | Security | TLS everywhere; mobile app holds no DB credentials; secrets in a secret manager. |
| NFR-003 | Performance | p95 API latency < 500 ms for list/detail; < 2 s for reports up to 10k rows. |
| NFR-004 | Availability | 99.5% monthly for API in production. |
| NFR-005 | Data | Point-in-time recovery enabled; restore tested each release. |
| NFR-006 | Precision | Money stored as `NUMERIC(19,4)`, displayed at 2 dp; rounding rules in `ACCOUNTING_RULES.md`. |
| NFR-007 | Localisation | English at launch; Arabic/RTL-ready layouts and string externalisation from day one. |
| NFR-008 | Time | All timestamps UTC; business dates as `DATE` in tenant timezone (default Asia/Dubai). |
| NFR-009 | Privacy | Comply with UAE PDPL; documented privacy policy for Play Store. |
| NFR-010 | Offline | Drafts persist locally; posting requires connectivity. |

---

## 5. Mobile navigation and UX

Bottom navigation: **Home · Sales · Purchases · Banking · More**

| Section | Contents |
|---|---|
| Home | Business selector, date filter, sales/collections/receivables/expenses/bank & cash summaries, quick actions |
| Sales | Quotations, invoices, receipts, customers, sales reports |
| Purchases | Purchase bills, supplier payments, expenses, suppliers, purchase reports |
| Banking | Bank accounts, cash accounts, transactions, transfers, balances |
| More | Reports, tax summary, products & services, users, business settings, subscription, help |

### 5.1 UX acceptance requirements

| ID | Requirement |
|---|---|
| UX-001 | A new user completes onboarding without technical assistance. |
| UX-002 | A basic invoice is prepared in under one minute once customer and item exist. |
| UX-003 | An expense is recorded in fewer than five primary input steps. |
| UX-004 | Amounts always show currency and correct decimal formatting. |
| UX-005 | Validation messages say what to correct. |
| UX-006 | Drafts are recoverable after an interrupted session. |
| UX-007 | Issued documents are visually distinct from drafts (badge + colour + locked fields). |
| UX-008 | Any transaction can be found by its reference number via global search. |
| UX-009 | Irreversible actions (issue, cancel, void, delete) require confirmation. |

---

## 6. Roadmap

| Version | Scope |
|---|---|
| **V1 – Business bookkeeping** | Android, sales, purchases, receipts, basic banking, VAT summaries, management reports, subscriptions |
| **V2 – Full accounting** | Double-entry, chart of accounts, journals, GL, trial balance, balance sheet, accrual statements, bank reconciliation, period closing |
| **V3 – Advanced business** | Inventory, stock valuation, branches, recurring transactions, advanced custom reporting, AI invoice scanning, payment integrations |
| **V4 – Platform expansion** | iOS, tenant web portal, additional countries, country tax engines, e-invoicing, analytics, AI financial assistant |

---

## 7. Assumptions, open decisions and gaps found in the baseline

These items were not fully specified in the baseline and are resolved here or flagged for approval.

| # | Item | Resolution in this document set | Status |
|---|---|---|---|
| D-01 | ORM: Prisma or Drizzle | **Recommend Drizzle**: reviewable SQL migrations, and RLS, triggers and exclusion constraints live in the same migration files. See [ADR-0001](adr/0001-orm-drizzle.md). | Needs approval |
| D-02 | Authentication provider | Abstracted behind `AuthProvider` interface. Recommend **Firebase Auth** (Flutter SDK maturity, cost at low volume); separate MFA project for Super Admins. See [ADR-0002](adr/0002-auth-firebase.md). | Needs approval |
| D-03 | Object storage | Recommend **AWS S3 in me-central-1** for UAE data residency. See [ADR-0003](adr/0003-object-storage-s3-uae.md). | Needs approval |
| D-13 | Database region | Neon may not offer a UAE region; decide whether database residency matters. | Open |
| D-04 | Supplier payments | Baseline required partial supplier payments but had no table. Added `supplier_payments` + `supplier_payment_allocations`. | Added |
| D-05 | Credit note lines | Baseline `credit_notes` had no lines; VAT reporting needs them. Added `credit_note_items`. | Added |
| D-06 | Document numbering | Added `document_sequences` table for gap-controlled, concurrency-safe numbering. | Added |
| D-07 | Opening balances | Customer/supplier opening balances stored as opening-balance documents so ageing and statements work. | Added |
| D-08 | Tax codes ownership | Baseline ERD showed `TENANTS → TAX_CODES` but table had no `tenant_id`. Resolved: global `tax_codes` + `tax_rates`; tenants select via `tenant_tax_settings` and may add tenant-specific codes (`tenant_id` nullable). | Resolved |
| D-09 | Idempotency | Added `idempotency_keys` for all POST posting endpoints. | Added |
| D-10 | Cheque payment method | Added "Cheque" (common in UAE). | Needs approval |
| D-11 | Rounding | Line-level VAT rounding to 2 dp, half-up; document VAT = Σ line VAT. To be confirmed by tax adviser. | Needs approval |
| D-12 | Plan pricing and limits | Not specified. To be set by business owner before Sprint 9. | Open |

---

## 8. Change control

1. Any change to business rules, schema, financial calculations or security policy requires a written change request (CR) referencing affected requirement IDs.
2. CRs are approved by the product owner; schema and financial changes also need technical-lead review.
3. Approved CRs update this PRD (version bump) and `CHANGELOG.md` in the same pull request as the implementation.
