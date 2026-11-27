import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './access.js';

// Tax configuration (DATABASE_ERD.md §4.3). Rates are data, never hardcoded (VAT-003).
// RLS and the tax_rates overlap constraint are in drizzle/0005_tax_rls_and_seed.sql.

export const TAX_TREATMENTS = [
  'standard',
  'zero_rated',
  'exempt',
  'out_of_scope',
  'reverse_charge',
] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

export const TAX_DIRECTIONS = ['sales', 'purchases', 'both'] as const;
export type TaxDirection = (typeof TAX_DIRECTIONS)[number];

export const taxCodes = pgTable(
  'tax_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL = country default shared by all tenants. */
    tenantId: uuid('tenant_id').references(() => tenants.id),
    countryCode: text('country_code').notNull(),
    code: text('code').notNull(),
    description: text('description').notNull(),
    taxTreatment: text('tax_treatment').$type<TaxTreatment>().notNull(),
    direction: text('direction').$type<TaxDirection>().notNull(),
    /** Input VAT on this code can be reclaimed. */
    isRecoverable: boolean('is_recoverable').notNull().default(true),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('tax_codes_tenant_country_code_key')
      .on(t.tenantId, t.countryCode, t.code)
      .nullsNotDistinct(),
    check(
      'tax_codes_treatment_chk',
      sql`${t.taxTreatment} IN ('standard','zero_rated','exempt','out_of_scope','reverse_charge')`,
    ),
    check('tax_codes_direction_chk', sql`${t.direction} IN ('sales','purchases','both')`),
    check('tax_codes_country_chk', sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
  ],
);

export const taxRates = pgTable(
  'tax_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taxCodeId: uuid('tax_code_id')
      .notNull()
      .references(() => taxCodes.id),
    /** Percent, e.g. 5.0000 = 5%. */
    rate: numeric('rate', { precision: 7, scale: 4 }).notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
  },
  (t) => [
    check('tax_rates_rate_chk', sql`${t.rate} >= 0 AND ${t.rate} <= 100`),
    check(
      'tax_rates_range_chk',
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`,
    ),
    index('tax_rates_code_idx').on(t.taxCodeId, t.effectiveFrom),
  ],
);

export const REPORTING_FREQUENCIES = ['monthly', 'quarterly'] as const;
export type ReportingFrequency = (typeof REPORTING_FREQUENCIES)[number];

export const tenantTaxSettings = pgTable(
  'tenant_tax_settings',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id),
    isVatRegistered: boolean('is_vat_registered').notNull().default(false),
    taxRegistrationNumber: text('tax_registration_number'),
    registrationDate: date('registration_date'),
    reportingFrequency: text('reporting_frequency')
      .$type<ReportingFrequency>()
      .notNull()
      .default('quarterly'),
    periodStartMonth: smallint('period_start_month').notNull().default(1),
    defaultSalesTaxCodeId: uuid('default_sales_tax_code_id').references(() => taxCodes.id),
    defaultPurchaseTaxCodeId: uuid('default_purchase_tax_code_id').references(() => taxCodes.id),
    pricesIncludeTax: boolean('prices_include_tax').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'tenant_tax_settings_trn_chk',
      sql`${t.taxRegistrationNumber} IS NULL OR ${t.taxRegistrationNumber} ~ '^[0-9]{15}$'`,
    ),
    check(
      'tenant_tax_settings_registered_chk',
      sql`NOT ${t.isVatRegistered} OR ${t.taxRegistrationNumber} IS NOT NULL`,
    ),
    check(
      'tenant_tax_settings_frequency_chk',
      sql`${t.reportingFrequency} IN ('monthly','quarterly')`,
    ),
    check('tenant_tax_settings_period_chk', sql`${t.periodStartMonth} BETWEEN 1 AND 12`),
  ],
);
