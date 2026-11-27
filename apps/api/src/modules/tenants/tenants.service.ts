import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  documentSequences,
  roles,
  tenantMemberships,
  tenants,
  tenantSettings,
} from '../../infrastructure/db/schema/index.js';
import { setContext } from '../../infrastructure/db/transaction-manager.js';
import { ctx, currentTenant, currentUser } from '../../common/context/request-context.js';
import { AuditService } from '../audit/audit.service.js';
import { listMemberships, type MembershipView } from '../access/memberships.js';
import { DEFAULT_SEQUENCES, DEFAULT_SETTINGS } from './tenant-defaults.js';
import type { CreateTenantInput, UpdateTenantInput } from './tenants.dto.js';

export type TenantView = Omit<typeof tenants.$inferSelect, 'logoDocumentId'>;

function toView(row: typeof tenants.$inferSelect): TenantView {
  const { logoDocumentId: _logo, ...view } = row;
  return view;
}

@Injectable()
export class TenantsService {
  constructor(private readonly audit: AuditService) {}

  /**
   * TEN-001/TEN-010: creates the business, makes the caller its Owner, and seeds default settings
   * and numbering, all in the request transaction.
   */
  async create(input: CreateTenantInput): Promise<TenantView> {
    const { tx, identity } = ctx();
    const user = currentUser();
    const id = randomUUID();

    // Switch the transaction's RLS context to the new tenant before writing its rows.
    await setContext(tx, {
      authSubject: `${identity.provider}:${identity.providerUserId}`,
      userId: user.id,
      tenantId: id,
    });

    const [tenant] = await tx
      .insert(tenants)
      .values({
        id,
        legalName: input.legalName,
        tradingName: input.tradingName ?? null,
        countryCode: input.countryCode ?? 'AE',
        baseCurrency: 'AED',
        timezone: 'Asia/Dubai',
        financialYearStart: input.financialYearStart ?? 1,
        address: input.address ?? {},
        phone: input.phone ?? null,
        email: input.email ?? null,
      })
      .returning();
    if (!tenant) throw new InternalServerErrorException('Tenant was not created');

    const [ownerRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(isNull(roles.tenantId), eq(roles.code, 'owner')))
      .limit(1);
    if (!ownerRole) throw new InternalServerErrorException('Owner role is not seeded');

    await tx.insert(tenantMemberships).values({
      tenantId: id,
      userId: user.id,
      roleId: ownerRole.id,
      isOwner: true,
      status: 'active',
    });

    await tx.insert(tenantSettings).values(
      Object.entries(DEFAULT_SETTINGS).map(([settingKey, settingValue]) => ({
        tenantId: id,
        settingKey,
        settingValue,
      })),
    );
    await tx
      .insert(documentSequences)
      .values(DEFAULT_SEQUENCES.map((s) => ({ tenantId: id, ...s, nextNumber: 1, padding: 5 })));

    await this.audit.record({
      tenantId: id,
      action: 'tenant.created',
      entityType: 'tenant',
      entityId: id,
      entityRef: tenant.legalName,
      after: toView(tenant),
    });
    return toView(tenant);
  }

  async listMine(): Promise<MembershipView[]> {
    return listMemberships(ctx().tx, currentUser().id);
  }

  async get(): Promise<TenantView> {
    const [row] = await ctx()
      .tx.select()
      .from(tenants)
      .where(eq(tenants.id, currentTenant().id))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    return toView(row);
  }

  async update(input: UpdateTenantInput): Promise<TenantView> {
    const { tx } = ctx();
    const before = await this.get();
    const [row] = await tx
      .update(tenants)
      .set({
        ...(input.legalName !== undefined && { legalName: input.legalName }),
        ...(input.tradingName !== undefined && { tradingName: input.tradingName }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.financialYearStart !== undefined && {
          financialYearStart: input.financialYearStart,
        }),
      })
      .where(eq(tenants.id, currentTenant().id))
      .returning();
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });

    const after = toView(row);
    await this.audit.record({
      action: 'tenant.updated',
      entityType: 'tenant',
      entityId: row.id,
      entityRef: row.legalName,
      before: changedFields(before, after, 'before'),
      after: changedFields(before, after, 'after'),
    });
    return after;
  }
}

/** Only the fields that actually changed, from one side of the diff. */
function changedFields(
  before: TenantView,
  after: TenantView,
  side: 'before' | 'after',
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof TenantView)[]) {
    if (key === 'updatedAt') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      out[key] = side === 'before' ? before[key] : after[key];
    }
  }
  return out;
}
