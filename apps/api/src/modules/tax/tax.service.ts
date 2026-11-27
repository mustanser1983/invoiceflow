import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  taxCodes,
  taxRates,
  tenants,
  tenantTaxSettings,
  type TaxDirection,
  type TaxTreatment,
} from '../../infrastructure/db/schema/index.js';
import type { Tx } from '../../infrastructure/db/transaction-manager.js';
import { ctx, currentTenant } from '../../common/context/request-context.js';
import { isUniqueViolation } from '../../common/pg-errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateTaxCodeInput, UpdateTaxSettingsInput } from './tax.dto.js';

export interface TaxCodeView {
  id: string;
  code: string;
  description: string;
  taxTreatment: TaxTreatment;
  direction: TaxDirection;
  isRecoverable: boolean;
  isSystem: boolean;
  /** Rate in force today, as a decimal string (e.g. "5.0000"), or null if none. */
  currentRate: string | null;
}

export type TaxSettingsView = Omit<typeof tenantTaxSettings.$inferSelect, 'tenantId'>;

/** Default codes by registration status (VAT-005: unregistered businesses charge no VAT). */
const DEFAULT_CODES = {
  registered: { sales: 'SR', purchases: 'SR' },
  unregistered: { sales: 'OS', purchases: 'SR-NR' },
} as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Looks up a shared country default code by its short code (SR, OS, ...). */
async function systemCodeId(tx: Tx, countryCode: string, code: string): Promise<string> {
  const [row] = await tx
    .select({ id: taxCodes.id })
    .from(taxCodes)
    .where(
      and(
        isNull(taxCodes.tenantId),
        eq(taxCodes.countryCode, countryCode),
        eq(taxCodes.code, code),
      ),
    )
    .limit(1);
  if (!row) throw new InternalServerErrorException(`Tax code ${countryCode}/${code} is not seeded`);
  return row.id;
}

/** Creates tax settings for a new tenant (not registered). Used by TenantsService.create. */
export async function createDefaultTaxSettings(
  tx: Tx,
  tenantId: string,
  countryCode: string,
): Promise<void> {
  await tx.insert(tenantTaxSettings).values({
    tenantId,
    defaultSalesTaxCodeId: await systemCodeId(tx, countryCode, DEFAULT_CODES.unregistered.sales),
    defaultPurchaseTaxCodeId: await systemCodeId(
      tx,
      countryCode,
      DEFAULT_CODES.unregistered.purchases,
    ),
  });
}

@Injectable()
export class TaxService {
  constructor(private readonly audit: AuditService) {}

  async getSettings(): Promise<TaxSettingsView> {
    const [row] = await ctx()
      .tx.select()
      .from(tenantTaxSettings)
      .where(eq(tenantTaxSettings.tenantId, currentTenant().id))
      .limit(1);
    if (!row) throw new InternalServerErrorException('Tax settings are missing for this business');
    const { tenantId: _t, ...view } = row;
    return view;
  }

  async updateSettings(input: UpdateTaxSettingsInput): Promise<TaxSettingsView> {
    const { tx } = ctx();
    const tenantId = currentTenant().id;
    const before = await this.getSettings();
    const countryCode = await this.tenantCountry();

    const isVatRegistered = input.isVatRegistered ?? before.isVatRegistered;
    const trn =
      input.taxRegistrationNumber !== undefined
        ? input.taxRegistrationNumber
        : before.taxRegistrationNumber;
    if (isVatRegistered && !trn) {
      throw validation('taxRegistrationNumber', 'Enter your 15-digit TRN to register for VAT');
    }

    // Switching registration resets default codes unless the caller chose them.
    const registrationChanged = isVatRegistered !== before.isVatRegistered;
    const defaults = isVatRegistered ? DEFAULT_CODES.registered : DEFAULT_CODES.unregistered;
    const salesCodeId =
      input.defaultSalesTaxCodeId ??
      (registrationChanged
        ? await systemCodeId(tx, countryCode, defaults.sales)
        : before.defaultSalesTaxCodeId);
    const purchaseCodeId =
      input.defaultPurchaseTaxCodeId ??
      (registrationChanged
        ? await systemCodeId(tx, countryCode, defaults.purchases)
        : before.defaultPurchaseTaxCodeId);

    if (salesCodeId) {
      const code = await this.findCode(salesCodeId, 'defaultSalesTaxCodeId');
      if (code.direction === 'purchases') {
        throw validation('defaultSalesTaxCodeId', 'This tax code is for purchases only');
      }
      if (!isVatRegistered && code.taxTreatment !== 'out_of_scope') {
        throw validation(
          'defaultSalesTaxCodeId',
          'A business that is not VAT registered cannot charge VAT on sales',
        );
      }
    }
    if (purchaseCodeId) {
      const code = await this.findCode(purchaseCodeId, 'defaultPurchaseTaxCodeId');
      if (code.direction === 'sales') {
        throw validation('defaultPurchaseTaxCodeId', 'This tax code is for sales only');
      }
    }

    const [row] = await tx
      .update(tenantTaxSettings)
      .set({
        isVatRegistered,
        taxRegistrationNumber: isVatRegistered ? trn : (trn ?? null),
        ...(input.registrationDate !== undefined && { registrationDate: input.registrationDate }),
        ...(input.reportingFrequency !== undefined && {
          reportingFrequency: input.reportingFrequency,
        }),
        ...(input.periodStartMonth !== undefined && { periodStartMonth: input.periodStartMonth }),
        ...(input.pricesIncludeTax !== undefined && { pricesIncludeTax: input.pricesIncludeTax }),
        defaultSalesTaxCodeId: salesCodeId,
        defaultPurchaseTaxCodeId: purchaseCodeId,
      })
      .where(eq(tenantTaxSettings.tenantId, tenantId))
      .returning();
    if (!row) throw new InternalServerErrorException('Tax settings were not updated');
    const { tenantId: _t, ...after } = row;

    await this.audit.record({
      action: 'tax.settings_updated',
      entityType: 'tenant_tax_settings',
      entityId: tenantId,
      before: diff(before, after, 'before'),
      after: diff(before, after, 'after'),
    });
    return after;
  }

  /** Codes available to this tenant: its country's defaults plus its own, with today's rate. */
  async listCodes(): Promise<TaxCodeView[]> {
    const { tx } = ctx();
    const countryCode = await this.tenantCountry();
    const day = today();
    const rows = await tx
      .select({
        id: taxCodes.id,
        tenantId: taxCodes.tenantId,
        code: taxCodes.code,
        description: taxCodes.description,
        taxTreatment: taxCodes.taxTreatment,
        direction: taxCodes.direction,
        isRecoverable: taxCodes.isRecoverable,
        currentRate: taxRates.rate,
      })
      .from(taxCodes)
      .leftJoin(
        taxRates,
        and(
          eq(taxRates.taxCodeId, taxCodes.id),
          lte(taxRates.effectiveFrom, day),
          or(isNull(taxRates.effectiveTo), gte(taxRates.effectiveTo, day)),
        ),
      )
      .where(and(eq(taxCodes.countryCode, countryCode), eq(taxCodes.active, true)))
      .orderBy(sql`${taxCodes.tenantId} NULLS FIRST`, taxCodes.code);

    return rows.map(({ tenantId, ...r }) => ({ ...r, isSystem: tenantId === null }));
  }

  async createCode(input: CreateTaxCodeInput): Promise<TaxCodeView> {
    const { tx } = ctx();
    const tenantId = currentTenant().id;
    const countryCode = await this.tenantCountry();
    const id = randomUUID();
    try {
      await tx.insert(taxCodes).values({
        id,
        tenantId,
        countryCode,
        code: input.code,
        description: input.description,
        taxTreatment: input.taxTreatment,
        direction: input.direction,
        isRecoverable: input.isRecoverable,
      });
    } catch (err) {
      if (isUniqueViolation(err, 'tax_codes_tenant_country_code_key')) {
        throw new ConflictException({
          code: 'DUPLICATE',
          message: `Tax code ${input.code} already exists`,
        });
      }
      throw err;
    }
    await tx
      .insert(taxRates)
      .values({ taxCodeId: id, rate: input.rate, effectiveFrom: input.effectiveFrom });

    await this.audit.record({
      action: 'tax.code_created',
      entityType: 'tax_code',
      entityId: id,
      entityRef: input.code,
      after: { ...input },
    });
    const created = (await this.listCodes()).find((c) => c.id === id);
    return (
      created ?? {
        id,
        code: input.code,
        description: input.description,
        taxTreatment: input.taxTreatment,
        direction: input.direction,
        isRecoverable: input.isRecoverable,
        isSystem: false,
        currentRate: null,
      }
    );
  }

  private async tenantCountry(): Promise<string> {
    const [row] = await ctx()
      .tx.select({ countryCode: tenants.countryCode })
      .from(tenants)
      .where(eq(tenants.id, currentTenant().id))
      .limit(1);
    if (!row) throw new InternalServerErrorException('Business not found');
    return row.countryCode;
  }

  private async findCode(id: string, field: string) {
    const [row] = await ctx()
      .tx.select({
        id: taxCodes.id,
        direction: taxCodes.direction,
        taxTreatment: taxCodes.taxTreatment,
        active: taxCodes.active,
      })
      .from(taxCodes)
      .where(eq(taxCodes.id, id))
      .limit(1);
    if (!row || !row.active) throw validation(field, 'Choose one of your tax codes');
    return row;
  }
}

function validation(field: string, message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message,
    details: [{ field, message }],
  });
}

function diff<T extends object>(before: T, after: T, side: 'before' | 'after') {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (key === 'updatedAt') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      out[key as string] = side === 'before' ? before[key] : after[key];
    }
  }
  return out;
}
