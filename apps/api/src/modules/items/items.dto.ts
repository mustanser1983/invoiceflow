import { z } from 'zod';
import { listQuerySchema } from '../../common/pagination.js';
import { EXPENSE_CATEGORY_TYPES, ITEM_TYPES } from '../../infrastructure/db/schema/index.js';

/** Money in JSON is a decimal string (ARCHITECTURE_AND_API.md §7), up to 4 decimals. */
export const moneyString = z
  .string()
  .trim()
  .regex(/^\d{1,15}(\.\d{1,4})?$/, 'Enter an amount such as 125 or 125.50');

const itemFields = {
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9/_.-]{1,30}$/, 'Use up to 30 letters, digits, /, _, . or -')
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'Enter a name').max(200),
  description: z.string().trim().max(2000).nullable(),
  itemType: z.enum(ITEM_TYPES),
  unit: z.string().trim().min(1).max(20),
  sellingPrice: moneyString,
  purchaseCost: moneyString.nullable(),
  defaultTaxCodeId: z.string().uuid().nullable(),
};

export const createItemSchema = z
  .object({
    ...itemFields,
    code: itemFields.code.optional(),
    description: itemFields.description.optional(),
    unit: itemFields.unit.optional(),
    sellingPrice: itemFields.sellingPrice.optional(),
    purchaseCost: itemFields.purchaseCost.optional(),
    defaultTaxCodeId: itemFields.defaultTaxCodeId.optional(),
  })
  .strict();

export const updateItemSchema = z
  .object({
    code: itemFields.code.optional(),
    name: itemFields.name.optional(),
    description: itemFields.description.optional(),
    itemType: itemFields.itemType.optional(),
    unit: itemFields.unit.optional(),
    sellingPrice: itemFields.sellingPrice.optional(),
    purchaseCost: itemFields.purchaseCost.optional(),
    defaultTaxCodeId: itemFields.defaultTaxCodeId.optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listItemsSchema = listQuerySchema(['name', 'code', 'createdAt']).extend({
  itemType: z.enum(ITEM_TYPES).optional(),
});

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    categoryType: z.enum(EXPENSE_CATEGORY_TYPES).default('operating'),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    categoryType: z.enum(EXPENSE_CATEGORY_TYPES).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listCategoriesSchema = z
  .object({ status: z.enum(['active', 'inactive', 'all']).default('active') })
  .strict();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ListItemsQuery = z.infer<typeof listItemsSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesSchema>;
