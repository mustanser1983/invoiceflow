import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext } from './types.js';

// Platform and access tables (DATABASE_ERD.md §4.1).
// Row-level security for these tables is defined in drizzle/0002_rls.sql, not here.

export type TenantAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  emirate?: string;
  poBox?: string;
};

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: text('legal_name').notNull(),
    tradingName: text('trading_name'),
    countryCode: text('country_code').notNull().default('AE'),
    baseCurrency: text('base_currency').notNull().default('AED'),
    timezone: text('timezone').notNull().default('Asia/Dubai'),
    financialYearStart: smallint('financial_year_start').notNull().default(1),
    address: jsonb('address').$type<TenantAddress>().notNull().default({}),
    phone: text('phone'),
    email: citext('email'),
    logoDocumentId: uuid('logo_document_id'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('tenants_country_code_chk', sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
    check('tenants_base_currency_chk', sql`${t.baseCurrency} ~ '^[A-Z]{3}$'`),
    check('tenants_fy_start_chk', sql`${t.financialYearStart} BETWEEN 1 AND 12`),
    check('tenants_status_chk', sql`${t.status} IN ('active','suspended','closed')`),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authProvider: text('auth_provider').notNull(),
    authProviderId: text('auth_provider_id').notNull(),
    fullName: text('full_name').notNull(),
    email: citext('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    phone: text('phone'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('users_email_key').on(t.email),
    unique('users_auth_provider_key').on(t.authProvider, t.authProviderId),
    check('users_status_chk', sql`${t.status} IN ('active','disabled')`),
  ],
);

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  permissionCode: text('permission_code').notNull().unique(),
  module: text('module').notNull(),
  description: text('description').notNull(),
});

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL = system role template shared by all tenants. */
    tenantId: uuid('tenant_id').references(() => tenants.id),
    code: text('code'),
    name: text('name').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('roles_tenant_name_key').on(t.tenantId, t.name).nullsNotDistinct(),
    check('roles_system_chk', sql`(${t.isSystem} AND ${t.tenantId} IS NULL) OR NOT ${t.isSystem}`),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const tenantMemberships = pgTable(
  'tenant_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    isOwner: boolean('is_owner').notNull().default(false),
    status: text('status').notNull().default('active'),
    invitedBy: uuid('invited_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('tenant_memberships_tenant_user_key').on(t.tenantId, t.userId),
    index('tenant_memberships_user_idx').on(t.userId),
    check('tenant_memberships_status_chk', sql`${t.status} IN ('invited','active','disabled')`),
  ],
);

export const userInvitations = pgTable('user_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  email: citext('email').notNull(),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    settingKey: text('setting_key').notNull(),
    settingValue: jsonb('setting_value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('tenant_settings_tenant_key_key').on(t.tenantId, t.settingKey)],
);

export const DOCUMENT_TYPES = [
  'quotation',
  'invoice',
  'credit_note',
  'receipt',
  'purchase_bill',
  'supplier_payment',
  'expense',
  'transfer',
  'customer',
  'supplier',
  'item',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const documentSequences = pgTable(
  'document_sequences',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    documentType: text('document_type').$type<DocumentType>().notNull(),
    prefix: text('prefix').notNull(),
    nextNumber: bigint('next_number', { mode: 'number' }).notNull().default(1),
    padding: smallint('padding').notNull().default(5),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.documentType] }),
    check(
      'document_sequences_type_chk',
      sql`${t.documentType} IN ('quotation','invoice','credit_note','receipt','purchase_bill','supplier_payment','expense','transfer','customer','supplier','item')`,
    ),
    check('document_sequences_next_chk', sql`${t.nextNumber} > 0`),
    check('document_sequences_padding_chk', sql`${t.padding} BETWEEN 1 AND 12`),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseCode: smallint('response_code'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);
