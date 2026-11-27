import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  documentSequences,
  roles,
  tenantMemberships,
  tenants,
  tenantSettings,
  type DocumentType,
} from '../../infrastructure/db/schema/index.js';
import { setContext } from '../../infrastructure/db/transaction-manager.js';
import { ctx, currentTenant, currentUser } from '../../common/context/request-context.js';
import { AuditService } from '../audit/audit.service.js';
import { listMemberships, type MembershipView } from '../access/memberships.js';
import { createDefaultTaxSettings } from '../tax/tax.service.js';
import {
  DEFAULT_SEQUENCES,
  DEFAULT_SETTINGS,
  formatDocumentNumber,
  SETTING_SCHEMAS,
  type SettingKey,
  type Settings,
} from './tenant-defaults.js';
import type {
  CreateTenantInput,
  UpdateNumberingInput,
  UpdateSettingsInput,
  UpdateTenantInput,
} from './tenants.dto.js';

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
    await createDefaultTaxSettings(tx, id, tenant.countryCode);

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

  /** All known settings, with defaults filled in for any missing key. */
  async getSettings(): Promise<Settings> {
    const rows = await ctx()
      .tx.select({ key: tenantSettings.settingKey, value: tenantSettings.settingValue })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, currentTenant().id));
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const { key, value } of rows) if (key in SETTING_SCHEMAS) out[key] = value;
    return out as Settings;
  }

  async updateSettings(input: UpdateSettingsInput): Promise<Settings> {
    const { tx } = ctx();
    const tenantId = currentTenant().id;
    const before = await this.getSettings();
    const changes = Object.entries(input).filter(
      ([key, value]) => JSON.stringify(before[key as SettingKey]) !== JSON.stringify(value),
    );
    for (const [settingKey, settingValue] of changes) {
      await tx
        .insert(tenantSettings)
        .values({ tenantId, settingKey, settingValue })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.settingKey],
          set: { settingValue },
        });
    }
    if (changes.length > 0) {
      await this.audit.record({
        action: 'tenant.settings_updated',
        entityType: 'tenant_settings',
        entityId: tenantId,
        before: Object.fromEntries(changes.map(([k]) => [k, before[k as SettingKey]])),
        after: Object.fromEntries(changes),
      });
    }
    return this.getSettings();
  }

  async getNumbering(): Promise<NumberingView[]> {
    const rows = await ctx()
      .tx.select()
      .from(documentSequences)
      .where(eq(documentSequences.tenantId, currentTenant().id));
    const order = new Map(DEFAULT_SEQUENCES.map((s, i) => [s.documentType, i]));
    return rows
      .sort((a, b) => (order.get(a.documentType) ?? 99) - (order.get(b.documentType) ?? 99))
      .map((r) => ({
        documentType: r.documentType,
        prefix: r.prefix,
        nextNumber: r.nextNumber,
        padding: r.padding,
        preview: formatDocumentNumber(r.prefix, r.nextNumber, r.padding),
      }));
  }

  /**
   * TEN-008. The next number can move forward but never back, so a number that may already
   * have been used is never issued twice.
   */
  async updateNumbering(input: UpdateNumberingInput): Promise<NumberingView[]> {
    const { tx } = ctx();
    const tenantId = currentTenant().id;
    const current = new Map((await this.getNumbering()).map((s) => [s.documentType, s]));

    const changed: { before: NumberingView; after: Record<string, unknown> }[] = [];
    for (const change of input.sequences) {
      const existing = current.get(change.documentType);
      if (!existing) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: `No numbering for ${change.documentType}`,
        });
      }
      if (change.nextNumber !== undefined && change.nextNumber < existing.nextNumber) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: `The next ${change.documentType.replace('_', ' ')} number can't go below ${existing.nextNumber}`,
          details: [
            {
              field: `sequences.${change.documentType}.nextNumber`,
              message: `Must be ${existing.nextNumber} or more`,
            },
          ],
        });
      }
      // Lock the row so a concurrent issue can't take a number while we change it.
      const [locked] = await tx
        .select({ nextNumber: documentSequences.nextNumber })
        .from(documentSequences)
        .where(
          and(
            eq(documentSequences.tenantId, tenantId),
            eq(documentSequences.documentType, change.documentType),
          ),
        )
        .for('update');
      const nextNumber =
        change.nextNumber !== undefined
          ? Math.max(change.nextNumber, locked?.nextNumber ?? 1)
          : undefined;
      const set = {
        ...(change.prefix !== undefined && { prefix: change.prefix }),
        ...(nextNumber !== undefined && { nextNumber }),
        ...(change.padding !== undefined && { padding: change.padding }),
      };
      if (Object.keys(set).length === 0) continue;
      await tx
        .update(documentSequences)
        .set(set)
        .where(
          and(
            eq(documentSequences.tenantId, tenantId),
            eq(documentSequences.documentType, change.documentType),
          ),
        );
      changed.push({ before: existing, after: { documentType: change.documentType, ...set } });
    }

    if (changed.length > 0) {
      await this.audit.record({
        action: 'tenant.numbering_updated',
        entityType: 'document_sequences',
        entityId: tenantId,
        before: { sequences: changed.map((c) => c.before) },
        after: { sequences: changed.map((c) => c.after) },
      });
    }
    return this.getNumbering();
  }

  /**
   * Marks onboarding complete once the minimum business details are present (UX-001).
   * Idempotent.
   */
  async completeOnboarding(): Promise<TenantView> {
    const { tx } = ctx();
    const tenant = await this.get();
    if (tenant.onboardingCompletedAt) return tenant;

    const missing: { field: string; message: string }[] = [];
    if (!tenant.address.emirate)
      missing.push({ field: 'address.emirate', message: 'Choose your emirate' });
    if (!tenant.address.city && !tenant.address.line1) {
      missing.push({ field: 'address.line1', message: 'Enter your business address' });
    }
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'ONBOARDING_INCOMPLETE',
        message: 'A few business details are still missing',
        details: missing,
      });
    }

    const [row] = await tx
      .update(tenants)
      .set({ onboardingCompletedAt: sql`now()` })
      .where(eq(tenants.id, tenant.id))
      .returning();
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    await tx
      .insert(tenantSettings)
      .values({ tenantId: tenant.id, settingKey: 'onboarding.step', settingValue: 'done' })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.settingKey],
        set: { settingValue: 'done' },
      });
    await this.audit.record({
      action: 'tenant.onboarding_completed',
      entityType: 'tenant',
      entityId: tenant.id,
      entityRef: tenant.legalName,
    });
    return toView(row);
  }
}

export interface NumberingView {
  documentType: DocumentType;
  prefix: string;
  nextNumber: number;
  padding: number;
  /** What the next document number will look like, e.g. INV-00001. */
  preview: string;
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
