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

/** Default business settings (TEN-010). Tax, bank and category defaults arrive with those modules. */
export const DEFAULT_SETTINGS: Readonly<Record<string, unknown>> = {
  'locale.language': 'en',
  'locale.date_format': 'dd/MM/yyyy',
  'sales.default_payment_terms_days': 30,
  'sales.quotation_validity_days': 30,
  'sales.default_terms': '',
  'onboarding.step': 'business_details',
};
