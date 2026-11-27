import { z } from 'zod';
import { listQuerySchema } from '../../common/pagination.js';
import { UAE_EMIRATES } from '../tenants/tenants.dto.js';

const addressSchema = z
  .object({
    line1: z.string().trim().max(200).optional(),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().max(100).optional(),
    emirate: z.enum(UAE_EMIRATES).optional(),
    poBox: z.string().trim().max(20).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/, 'Use a 2-letter country code')
      .optional(),
  })
  .strict();

const fields = {
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9/_-]{1,20}$/, 'Use up to 20 letters, digits, /, _ or -')
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'Enter a name').max(200),
  contactPerson: z.string().trim().max(120).nullable(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number')
    .nullable(),
  address: addressSchema,
  taxRegistrationNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{15}$/, 'A TRN is 15 digits')
    .nullable(),
  paymentTermsDays: z.number().int().min(0).max(365),
  notes: z.string().trim().max(2000).nullable(),
};

export const createPartySchema = z
  .object({
    ...fields,
    code: fields.code.optional(),
    contactPerson: fields.contactPerson.optional(),
    email: fields.email.optional(),
    phone: fields.phone.optional(),
    address: fields.address.optional(),
    taxRegistrationNumber: fields.taxRegistrationNumber.optional(),
    paymentTermsDays: fields.paymentTermsDays.optional(),
    notes: fields.notes.optional(),
  })
  .strict();

export const updatePartySchema = z
  .object({
    code: fields.code.optional(),
    name: fields.name.optional(),
    contactPerson: fields.contactPerson.optional(),
    email: fields.email.optional(),
    phone: fields.phone.optional(),
    address: fields.address.optional(),
    taxRegistrationNumber: fields.taxRegistrationNumber.optional(),
    paymentTermsDays: fields.paymentTermsDays.optional(),
    notes: fields.notes.optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listPartiesSchema = listQuerySchema(['name', 'code', 'createdAt']);

export const duplicatesQuerySchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    taxRegistrationNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{15}$/)
      .optional(),
    excludeId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (v) => v.name !== undefined || v.email !== undefined || v.taxRegistrationNumber !== undefined,
    'Give a name, email or TRN to check',
  );

export type CreatePartyInput = z.infer<typeof createPartySchema>;
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;
export type ListPartiesQuery = z.infer<typeof listPartiesSchema>;
export type DuplicatesQuery = z.infer<typeof duplicatesQuerySchema>;
