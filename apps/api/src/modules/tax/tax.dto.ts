import { z } from 'zod';
import {
  REPORTING_FREQUENCIES,
  TAX_DIRECTIONS,
  TAX_TREATMENTS,
} from '../../infrastructure/db/schema/index.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const updateTaxSettingsSchema = z
  .object({
    isVatRegistered: z.boolean().optional(),
    // UAE Tax Registration Number: 15 digits (TEN-007).
    taxRegistrationNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{15}$/, 'A TRN is 15 digits')
      .nullable()
      .optional(),
    registrationDate: isoDate.nullable().optional(),
    reportingFrequency: z.enum(REPORTING_FREQUENCIES).optional(),
    periodStartMonth: z.number().int().min(1).max(12).optional(),
    defaultSalesTaxCodeId: z.string().uuid().optional(),
    defaultPurchaseTaxCodeId: z.string().uuid().optional(),
    pricesIncludeTax: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const createTaxCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9-]{1,12}$/, 'Use 1–12 capital letters, digits or dashes'),
    description: z.string().trim().min(2).max(120),
    taxTreatment: z.enum(TAX_TREATMENTS),
    direction: z.enum(TAX_DIRECTIONS),
    isRecoverable: z.boolean().default(true),
    rate: z
      .string()
      .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Enter a percentage such as 5 or 5.25')
      .refine((r) => Number(r) <= 100, 'A rate cannot exceed 100%'),
    effectiveFrom: isoDate,
  })
  .strict();

export type UpdateTaxSettingsInput = z.infer<typeof updateTaxSettingsSchema>;
export type CreateTaxCodeInput = z.infer<typeof createTaxCodeSchema>;
