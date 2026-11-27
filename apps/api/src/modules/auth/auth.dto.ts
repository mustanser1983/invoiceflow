import { z } from 'zod';

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number')
      .optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
