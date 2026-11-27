# Invoiceflow — UAE VAT Rules (draft)

| | |
|---|---|
| **Status** | **Draft — not yet reviewed by a UAE tax adviser.** Must be signed off before production (PRD VAT-009, Sprint 10 task S10-9). |
| **Version** | 0.1 (Sprint 2) |
| **Related** | [PRD.md](PRD.md) §3.11 · [DATABASE_ERD.md](DATABASE_ERD.md) §4.3 · migration `apps/api/drizzle/0005_tax_rls_and_seed.sql` |

> Invoiceflow produces management and reconciliation VAT summaries. It does **not** file returns with the Federal Tax Authority (VAT-008).

## 1. What the system stores

- **Tax codes** are data, not code. UAE defaults are shared by all UAE businesses (`tax_codes.tenant_id IS NULL`); a business can add its own.
- **Rates** live in `tax_rates` with `effective_from` / `effective_to`. A database constraint stops two rates for the same code overlapping. Every document line will store the code, rate and amount it used (VAT-004), so a future rate change never alters past documents.
- **Tenant tax settings:** registration status, TRN, registration date, reporting frequency (monthly or quarterly), period start month, default sales and purchase codes, and whether prices include VAT.

## 2. Seeded UAE codes — to be confirmed

| Code | Description | Treatment | Direction | Input VAT recoverable | Rate from 2018-01-01 |
|---|---|---|---|---|---|
| `SR` | Standard rated | standard | sales & purchases | yes | 5% |
| `ZR` | Zero rated | zero_rated | sales & purchases | yes | 0% |
| `EX` | Exempt | exempt | sales & purchases | no | 0% |
| `OS` | Out of scope | out_of_scope | sales & purchases | no | 0% |
| `SR-NR` | Standard rated, input VAT not recoverable | standard | purchases | no | 5% |
| `RC` | Reverse charge (imports of services/goods) | reverse_charge | purchases | yes | 5% |

**Questions for the adviser**
1. Is this code set complete for an SME bookkeeping MVP? Candidates not yet included: designated-zone supplies, profit-margin scheme, tourist refund scheme, capital assets.
2. Reverse charge: for management reporting, should the system post both output and input VAT on `RC` purchases, and how should it be shown in the summary?
3. Should `EX` purchases be modelled separately from `EX` sales?
4. Which return boxes (VAT 201) should each code map to for the reconciliation summary?

## 3. Rules the system enforces today

| Rule | Where |
|---|---|
| A TRN is exactly 15 digits | API validation and a database check |
| A VAT-registered business must have a TRN | API validation and a database check |
| New businesses start **not registered**: sales default to `OS`, purchases to `SR-NR` (VAT paid but not reclaimable) | Tenant creation |
| Registering switches defaults to `SR` for sales and purchases unless the business picks others | `PATCH /tax/settings` |
| A business that is **not** VAT registered cannot default sales to a VAT-charging code; only out-of-scope codes are allowed (VAT-005) | `PATCH /tax/settings` |
| A sales default can't be a purchases-only code, and vice versa | `PATCH /tax/settings` |
| The 5% standard rate is never hardcoded | Rates are read from `tax_rates` |

## 4. To be defined with the adviser (before Sprint 4)

- Rounding: the current proposal is line-level VAT rounded half-up to 2 decimals, with document VAT = sum of line VAT (PRD D-11).
- Tax invoice content and layout for VAT-registered businesses: title, seller and buyer TRN, per-line rate and amount, totals in AED.
- When a simplified tax invoice is allowed.
- Credit note VAT treatment, and which period it reduces output VAT in.
- Handling of non-AED amounts once multi-currency documents arrive.
