import { z } from 'zod';
import { DOCUMENT_TYPES } from '../../infrastructure/db/schema/index.js';
import { SETTING_SCHEMAS } from './tenant-defaults.js';

export const UAE_EMIRATES = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
] as const;

const addressSchema = z
  .object({
    line1: z.string().trim().max(200).optional(),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().max(100).optional(),
    emirate: z.enum(UAE_EMIRATES).optional(),
    poBox: z.string().trim().max(20).optional(),
  })
  .strict();

const tenantFields = {
  legalName: z.string().trim().min(2, 'Enter the legal business name').max(200),
  tradingName: z.string().trim().max(200).nullable().optional(),
  address: addressSchema.optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number')
    .nullable()
    .optional(),
  email: z.string().trim().email('Enter a valid email address').nullable().optional(),
  financialYearStart: z.number().int().min(1).max(12).optional(),
};

export const createTenantSchema = z
  .object({
    ...tenantFields,
    // UAE only at launch (PRD §1); other countries need their own tax setup first.
    countryCode: z.literal('AE').optional(),
  })
  .strict();

export const updateTenantSchema = z
  .object({ ...tenantFields, legalName: tenantFields.legalName.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const updateSettingsSchema = z
  .object(
    Object.fromEntries(
      Object.entries(SETTING_SCHEMAS).map(([key, schema]) => [key, schema.optional()]),
    ) as { [K in keyof typeof SETTING_SCHEMAS]: z.ZodOptional<(typeof SETTING_SCHEMAS)[K]> },
  )
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const updateNumberingSchema = z
  .object({
    sequences: z
      .array(
        z
          .object({
            documentType: z.enum(DOCUMENT_TYPES),
            prefix: z
              .string()
              .regex(/^[A-Z0-9/-]{0,10}$/, 'Use up to 10 capital letters, digits, / or -')
              .optional(),
            nextNumber: z.number().int().min(1).max(999_999_999_999).optional(),
            padding: z.number().int().min(1).max(12).optional(),
          })
          .strict(),
      )
      .min(1)
      .refine(
        (list) => new Set(list.map((s) => s.documentType)).size === list.length,
        'Each document type may appear only once',
      ),
  })
  .strict();

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type UpdateNumberingInput = z.infer<typeof updateNumberingSchema>;
