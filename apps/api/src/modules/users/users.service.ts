import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import {
  permissions,
  rolePermissions,
  roles,
  tenantMemberships,
  userInvitations,
  users,
} from '../../infrastructure/db/schema/index.js';
import { setContext } from '../../infrastructure/db/transaction-manager.js';
import { ctx, currentTenant, currentUser } from '../../common/context/request-context.js';
import { isCheckViolation } from '../../common/pg-errors.js';
import { authSubject } from '../../infrastructure/auth/auth-provider.js';
import { AuditService } from '../audit/audit.service.js';
import { listMemberships, type MembershipView } from '../access/memberships.js';
import type { AcceptInvitationInput, InviteUserInput, UpdateMemberInput } from './users.dto.js';

export const INVITATION_TTL_DAYS = 7;

export interface MemberView {
  userId: string;
  fullName: string;
  email: string;
  isOwner: boolean;
  status: string;
  role: { id: string; code: string | null; name: string };
  joinedAt: Date;
}

export interface InvitationView {
  id: string;
  email: string;
  role: { id: string; code: string | null; name: string };
  expiresAt: Date;
  createdAt: Date;
}

export interface RoleView {
  id: string;
  code: string | null;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const LAST_OWNER = () =>
  new ConflictException({
    code: 'LAST_OWNER',
    message: 'A business must keep at least one active owner',
  });

@Injectable()
export class UsersService {
  constructor(private readonly audit: AuditService) {}

  async listMembers(): Promise<MemberView[]> {
    return ctx()
      .tx.select({
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        isOwner: tenantMemberships.isOwner,
        status: tenantMemberships.status,
        role: { id: roles.id, code: roles.code, name: roles.name },
        joinedAt: tenantMemberships.createdAt,
      })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .innerJoin(roles, eq(roles.id, tenantMemberships.roleId))
      .where(eq(tenantMemberships.tenantId, currentTenant().id))
      .orderBy(users.fullName);
  }

  async listInvitations(): Promise<InvitationView[]> {
    return ctx()
      .tx.select({
        id: userInvitations.id,
        email: userInvitations.email,
        role: { id: roles.id, code: roles.code, name: roles.name },
        expiresAt: userInvitations.expiresAt,
        createdAt: userInvitations.createdAt,
      })
      .from(userInvitations)
      .innerJoin(roles, eq(roles.id, userInvitations.roleId))
      .where(
        and(
          eq(userInvitations.tenantId, currentTenant().id),
          isNull(userInvitations.acceptedAt),
          sql`${userInvitations.expiresAt} > now()`,
        ),
      )
      .orderBy(userInvitations.createdAt);
  }

  /**
   * S2-10. Creates (or re-sends) an invitation. Until invitation emails exist, the response
   * carries the one-time token for the inviter to share; only its hash is stored.
   */
  async invite(input: InviteUserInput): Promise<InvitationView & { acceptToken: string }> {
    const { tx } = ctx();
    const tenant = currentTenant();
    const role = await this.findAssignableRole(input.roleId);

    const [existing] = await tx
      .select({ status: tenantMemberships.status })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(and(eq(tenantMemberships.tenantId, tenant.id), eq(users.email, input.email)))
      .limit(1);
    if (existing?.status === 'active') {
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: 'This person already has access to the business',
      });
    }

    // Re-inviting replaces the previous pending invitation (and its token).
    await tx
      .delete(userInvitations)
      .where(
        and(
          eq(userInvitations.tenantId, tenant.id),
          eq(userInvitations.email, input.email),
          isNull(userInvitations.acceptedAt),
        ),
      );

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const [row] = await tx
      .insert(userInvitations)
      .values({
        tenantId: tenant.id,
        email: input.email,
        roleId: role.id,
        tokenHash: hashToken(token),
        expiresAt,
        invitedBy: currentUser().id,
      })
      .returning({ id: userInvitations.id, createdAt: userInvitations.createdAt });

    await this.audit.record({
      action: 'user.invited',
      entityType: 'user_invitation',
      entityId: row!.id,
      entityRef: input.email,
      after: { email: input.email, role: role.name, expiresAt: expiresAt.toISOString() },
    });

    return {
      id: row!.id,
      email: input.email,
      role: { id: role.id, code: role.code, name: role.name },
      expiresAt,
      createdAt: row!.createdAt,
      acceptToken: token,
    };
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    const deleted = await ctx()
      .tx.delete(userInvitations)
      .where(
        and(
          eq(userInvitations.id, invitationId),
          eq(userInvitations.tenantId, currentTenant().id),
          isNull(userInvitations.acceptedAt),
        ),
      )
      .returning({ email: userInvitations.email });
    if (deleted.length === 0) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invitation not found' });
    }
    await this.audit.record({
      action: 'user.invitation_revoked',
      entityType: 'user_invitation',
      entityId: invitationId,
      entityRef: deleted[0]!.email,
    });
  }

  /**
   * The signed-in user accepts an invitation sent to their (verified) email address.
   * Not tenant-scoped: the token selects the tenant.
   */
  async accept(input: AcceptInvitationInput): Promise<MembershipView[]> {
    const { tx, identity } = ctx();
    const user = currentUser();

    const { rows } = await tx.execute<{
      id: string;
      tenant_id: string;
      email: string;
      role_id: string;
      expires_at: string;
      accepted_at: string | null;
    }>(sql`SELECT * FROM app.find_invitation(${hashToken(input.token)})`);
    const invitation = rows[0];
    if (!invitation || invitation.accepted_at || new Date(invitation.expires_at) <= new Date()) {
      throw new GoneException({
        code: 'INVITATION_INVALID',
        message: 'This invitation has expired or was already used. Ask for a new one.',
      });
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException({
        code: 'INVITATION_EMAIL_MISMATCH',
        message: 'This invitation was sent to a different email address',
      });
    }
    if (!user.emailVerified) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email address first',
      });
    }

    await setContext(tx, {
      authSubject: authSubject(identity),
      userId: user.id,
      tenantId: invitation.tenant_id,
    });
    const [role] = await tx
      .select({ code: roles.code, tenantId: roles.tenantId })
      .from(roles)
      .where(eq(roles.id, invitation.role_id))
      .limit(1);
    const isOwner = role?.code === 'owner' && role.tenantId === null;

    await tx
      .insert(tenantMemberships)
      .values({
        tenantId: invitation.tenant_id,
        userId: user.id,
        roleId: invitation.role_id,
        isOwner,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [tenantMemberships.tenantId, tenantMemberships.userId],
        set: { roleId: invitation.role_id, isOwner, status: 'active' },
      });
    await tx
      .update(userInvitations)
      .set({ acceptedAt: sql`now()` })
      .where(eq(userInvitations.id, invitation.id));

    await this.audit.record({
      tenantId: invitation.tenant_id,
      action: 'user.invitation_accepted',
      entityType: 'user_invitation',
      entityId: invitation.id,
      entityRef: user.email,
    });
    return listMemberships(tx, user.id);
  }

  /** Change a member's role or status. Owner changes need an Owner; one Owner must remain. */
  async updateMember(userId: string, input: UpdateMemberInput): Promise<MemberView> {
    const { tx } = ctx();
    const caller = currentTenant();
    const [member] = await tx
      .select({
        id: tenantMemberships.id,
        roleId: tenantMemberships.roleId,
        isOwner: tenantMemberships.isOwner,
        status: tenantMemberships.status,
      })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, caller.id), eq(tenantMemberships.userId, userId)))
      .limit(1);
    if (!member) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Member not found' });

    const newRole = input.roleId ? await this.findAssignableRole(input.roleId) : undefined;
    const becomesOwner = newRole ? newRole.isOwnerRole : member.isOwner;
    if ((member.isOwner || becomesOwner) && !caller.isOwner) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only an owner can change owner access',
      });
    }

    try {
      await tx
        .update(tenantMemberships)
        .set({
          ...(newRole && { roleId: newRole.id, isOwner: newRole.isOwnerRole }),
          ...(input.status && { status: input.status }),
        })
        .where(eq(tenantMemberships.id, member.id));
    } catch (err) {
      if (isCheckViolation(err, 'tenant_memberships_last_owner')) throw LAST_OWNER();
      throw err;
    }

    const after = (await this.listMembers()).find((m) => m.userId === userId)!;
    await this.audit.record({
      action: 'user.membership_updated',
      entityType: 'tenant_membership',
      entityId: member.id,
      entityRef: after.email,
      before: { roleId: member.roleId, isOwner: member.isOwner, status: member.status },
      after: { roleId: after.role.id, isOwner: after.isOwner, status: after.status },
    });
    return after;
  }

  async listRoles(): Promise<RoleView[]> {
    const { tx } = ctx();
    const rows = await tx
      .select({ id: roles.id, code: roles.code, name: roles.name, tenantId: roles.tenantId })
      .from(roles)
      .where(or(isNull(roles.tenantId), eq(roles.tenantId, currentTenant().id)))
      .orderBy(sql`${roles.tenantId} NULLS FIRST`, roles.name);
    const grants =
      rows.length === 0
        ? []
        : await tx
            .select({ roleId: rolePermissions.roleId, code: permissions.permissionCode })
            .from(rolePermissions)
            .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
            .where(
              inArray(
                rolePermissions.roleId,
                rows.map((r) => r.id),
              ),
            );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      isSystem: r.tenantId === null,
      permissions: grants
        .filter((g) => g.roleId === r.id)
        .map((g) => g.code)
        .sort(),
    }));
  }

  async listPermissions() {
    return ctx()
      .tx.select({
        code: permissions.permissionCode,
        module: permissions.module,
        description: permissions.description,
      })
      .from(permissions)
      .orderBy(permissions.module, permissions.permissionCode);
  }

  /** A role this tenant can assign: a system template or one of its own roles. */
  private async findAssignableRole(roleId: string) {
    const [role] = await ctx()
      .tx.select({ id: roles.id, code: roles.code, name: roles.name, tenantId: roles.tenantId })
      .from(roles)
      .where(
        and(
          eq(roles.id, roleId),
          or(isNull(roles.tenantId), eq(roles.tenantId, currentTenant().id)),
        ),
      )
      .limit(1);
    if (!role) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Role not found' });
    }
    const isOwnerRole = role.tenantId === null && role.code === 'owner';
    if (isOwnerRole && !currentTenant().isOwner) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only an owner can give someone owner access',
      });
    }
    return { ...role, isOwnerRole };
  }
}
