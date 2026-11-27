import { z } from 'zod';

export const inviteUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    roleId: z.string().uuid('Choose a role'),
  })
  .strict();

export const acceptInvitationSchema = z
  .object({ token: z.string().trim().min(20).max(200) })
  .strict();

export const updateMemberSchema = z
  .object({
    roleId: z.string().uuid().optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
