import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants, type TenantAddress } from './access.js';
import { taxCodes } from './tax.js';
import { citext } from './types.js';

// Master data (DATABASE_ERD.md §4.2–§4.3). RLS, trigram indexes and seeds are in
// drizzle/0007_master_data_rls_and_seed.sql.

export type PartyAddress = TenantAddress & { country?: string };

/**
 * Customers and suppliers share one shape. The TypeScript property for the code is `code` on
 * both; the database columns are customer_code and supplier_code.
 */
function partyTable(name: 'customers' | 'suppliers', codeColumn: string) {
  return pgTable(
    name,
    {
      id: uuid('id').primaryKey().defaultRandom(),
      tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id),
      code: text(codeColumn).notNull(),
      name: text('name').notNull(),
      contactPerson: text('contact_person'),
      email: citext('email'),
      phone: text('phone'),
      address: jsonb('address').$type<PartyAddress>().notNull().default({}),
      taxRegistrationNumber: text('tax_registration_number'),
      paymentTermsDays: smallint('payment_terms_days').notNull().default(0),
      currencyCode: text('currency_code').notNull().default('AED'),
      notes: text('notes'),
      status: text('status').$type<'active' | 'inactive'>().notNull().default('active'),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      // (tenant_id, id) lets future documents use tenant-consistent composite FKs.
      unique(`${name}_tenant_id_id_key`).on(t.tenantId, t.id),
      unique(`${name}_tenant_code_key`).on(t.tenantId, t.code),
      index(`${name}_tenant_status_idx`).on(t.tenantId, t.status),
      check(`${name}_status_chk`, sql`${t.status} IN ('active','inactive')`),
      check(`${name}_terms_chk`, sql`${t.paymentTermsDays} BETWEEN 0 AND 365`),
      check(`${name}_currency_chk`, sql`${t.currencyCode} ~ '^[A-Z]{3}$'`),
      check(
        `${name}_trn_chk`,
        sql`${t.taxRegistrationNumber} IS NULL OR ${t.taxRegistrationNumber} ~ '^[0-9]{15}$'`,
      ),
    ],
  );
}

export const customers = partyTable('customers', 'customer_code');
export const suppliers = partyTable('suppliers', 'supplier_code');
export type PartyTable = typeof customers;

export const EXPENSE_CATEGORY_TYPES = ['cost_of_sales', 'operating', 'other'] as const;
export type ExpenseCategoryType = (typeof EXPENSE_CATEGORY_TYPES)[number];

export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    categoryType: text('category_type').$type<ExpenseCategoryType>().notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    status: text('status').$type<'active' | 'inactive'>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('expense_categories_tenant_id_id_key').on(t.tenantId, t.id),
    unique('expense_categories_tenant_name_key').on(t.tenantId, t.name),
    check(
      'expense_categories_type_chk',
      sql`${t.categoryType} IN ('cost_of_sales','operating','other')`,
    ),
    check('expense_categories_status_chk', sql`${t.status} IN ('active','inactive')`),
  ],
);

export const ITEM_TYPES = ['product', 'service'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    code: text('item_code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    itemType: text('item_type').$type<ItemType>().notNull(),
    unit: text('unit').notNull().default('unit'),
    /** Money as numeric(19,4); handled as decimal strings, never JS numbers. */
    sellingPrice: numeric('selling_price', { precision: 19, scale: 4 }).notNull().default('0'),
    purchaseCost: numeric('purchase_cost', { precision: 19, scale: 4 }),
    defaultTaxCodeId: uuid('default_tax_code_id').references(() => taxCodes.id),
    status: text('status').$type<'active' | 'inactive'>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('items_tenant_id_id_key').on(t.tenantId, t.id),
    unique('items_tenant_code_key').on(t.tenantId, t.code),
    index('items_tenant_status_idx').on(t.tenantId, t.status),
    check('items_type_chk', sql`${t.itemType} IN ('product','service')`),
    check('items_status_chk', sql`${t.status} IN ('active','inactive')`),
    check('items_selling_price_chk', sql`${t.sellingPrice} >= 0`),
    check('items_purchase_cost_chk', sql`${t.purchaseCost} IS NULL OR ${t.purchaseCost} >= 0`),
  ],
);
