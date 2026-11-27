import { z } from 'zod';
import type { DocumentType } from '../../infrastructure/db/schema/index.js';

/** Default document numbering per type (TEN-008). Tenants can change prefix and next number. */
export const DEFAULT_SEQUENCES: ReadonlyArray<{ documentType: DocumentType; prefix: string }> = [
  { documentType: 'quotation', prefix: 'QUO-' },
  { documentType: 'invoice', prefix: 'INV-' },
  { documentType: 'credit_note', prefix: 'CN-' },
  { documentType: 'receipt', prefix: 'RCT-' },
  { documentType: 'purchase_bill', prefix: 'BILL-' },
  { documentType: 'supplier_payment', prefix: 'PAY-' },
  { documentType: 'expense', prefix: 'EXP-' },
  { documentType: 'transfer', prefix: 'TRF-' },
  { documentType: 'customer', prefix: 'CUS-' },
  { documentType: 'supplier', prefix: 'SUP-' },
];

export const ONBOARDING_STEPS = [
  'business_details',
  'financial_year',
  'vat',
  'numbering',
  'done',
] as const;

/**
 * Every business setting the API accepts, with its validation. Unknown keys are rejected so the
 * settings table can't fill up with typos.
 */
export const SETTING_SCHEMAS = {
  'locale.language': z.enum(['en', 'ar']),
  'locale.date_format': z.enum(['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']),
  'sales.default_payment_terms_days': z.number().int().min(0).max(365),
  'sales.quotation_validity_days': z.number().int().min(1).max(365),
  'sales.default_terms': z.string().max(2000),
  'onboarding.step': z.enum(ONBOARDING_STEPS),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type Settings = { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> };

/** Default business settings (TEN-010). Tax, bank and category defaults arrive with those modules. */
export const DEFAULT_SETTINGS: Settings = {
  'locale.language': 'en',
  'locale.date_format': 'dd/MM/yyyy',
  'sales.default_payment_terms_days': 30,
  'sales.quotation_validity_days': 30,
  'sales.default_terms': '',
  'onboarding.step': 'business_details',
};

/** e.g. formatNumber('INV-', 42, 5) → 'INV-00042'. */
export function formatDocumentNumber(prefix: string, n: number, padding: number): string {
  return `${prefix}${String(n).padStart(padding, '0')}`;
}
