import { and, eq, inArray } from 'drizzle-orm';
import {
  permissions,
  rolePermissions,
  roles,
  tenantMemberships,
  tenants,
} from '../../infrastructure/db/schema/index.js';
import type { Tx } from '../../infrastructure/db/transaction-manager.js';

export interface MembershipView {
  tenantId: string;
  legalName: string;
  tradingName: string | null;
  tenantStatus: string;
  isOwner: boolean;
  role: { id: string; code: string | null; name: string };
  permissions: string[];
}

/** Active memberships of a user across all tenants, with role and permission codes. */
export async function listMemberships(tx: Tx, userId: string): Promise<MembershipView[]> {
  const rows = await tx
    .select({
      tenantId: tenants.id,
      legalName: tenants.legalName,
      tradingName: tenants.tradingName,
      tenantStatus: tenants.status,
      isOwner: tenantMemberships.isOwner,
      roleId: roles.id,
      roleCode: roles.code,
      roleName: roles.name,
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .innerJoin(roles, eq(roles.id, tenantMemberships.roleId))
    .where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.status, 'active')))
    .orderBy(tenants.legalName);

  const roleIds = [...new Set(rows.map((r) => r.roleId))];
  const grants =
    roleIds.length === 0
      ? []
      : await tx
          .select({ roleId: rolePermissions.roleId, code: permissions.permissionCode })
          .from(rolePermissions)
          .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
          .where(inArray(rolePermissions.roleId, roleIds));

  const byRole = new Map<string, string[]>();
  for (const g of grants) byRole.set(g.roleId, [...(byRole.get(g.roleId) ?? []), g.code]);

  return rows.map((r) => ({
    tenantId: r.tenantId,
    legalName: r.legalName,
    tradingName: r.tradingName,
    tenantStatus: r.tenantStatus,
    isOwner: r.isOwner,
    role: { id: r.roleId, code: r.roleCode, name: r.roleName },
    permissions: (byRole.get(r.roleId) ?? []).sort(),
  }));
}
