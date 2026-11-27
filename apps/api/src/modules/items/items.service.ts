import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { expenseCategories, items, taxCodes } from '../../infrastructure/db/schema/index.js';
import { ctx, currentTenant } from '../../common/context/request-context.js';
import { likePattern, orderBy, Paginated } from '../../common/pagination.js';
import { isUniqueViolation } from '../../common/pg-errors.js';
import { AuditService } from '../audit/audit.service.js';
import { allocateFreeCode } from '../numbering/numbering.js';
import type {
  CreateCategoryInput,
  CreateItemInput,
  ListCategoriesQuery,
  ListItemsQuery,
  UpdateCategoryInput,
  UpdateItemInput,
} from './items.dto.js';

export type ItemView = Omit<typeof items.$inferSelect, 'tenantId'>;
export type CategoryView = Omit<typeof expenseCategories.$inferSelect, 'tenantId'>;

const notFound = (what: string) =>
  new NotFoundException({ code: 'NOT_FOUND', message: `${what} not found` });

/** Products and services (ITM-001 – ITM-005) and expense categories (EXP-004). */
@Injectable()
export class ItemsService {
  constructor(private readonly audit: AuditService) {}

  async list(query: ListItemsQuery): Promise<Paginated<ItemView>> {
    const filters: SQL[] = [eq(items.tenantId, currentTenant().id)];
    if (query.status !== 'all') filters.push(eq(items.status, query.status));
    if (query.itemType) filters.push(eq(items.itemType, query.itemType));
    if (query.search) {
      const p = likePattern(query.search);
      filters.push(or(ilike(items.name, p), ilike(items.code, p), ilike(items.description, p))!);
    }
    const where = and(...filters);
    const { tx } = ctx();
    const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(items).where(where);
    const rows = await tx
      .select()
      .from(items)
      .where(where)
      .orderBy(
        orderBy(query.sort, { name: items.name, code: items.code, createdAt: items.createdAt }),
        items.id,
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return Paginated.of(rows.map(stripTenant), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<ItemView> {
    const [row] = await ctx()
      .tx.select()
      .from(items)
      .where(and(eq(items.tenantId, currentTenant().id), eq(items.id, id)))
      .limit(1);
    if (!row) throw notFound('Product or service');
    return stripTenant(row);
  }

  async create(input: CreateItemInput): Promise<ItemView> {
    const { tx } = ctx();
    const tenantId = currentTenant().id;
    if (input.defaultTaxCodeId) await this.assertTaxCode(input.defaultTaxCodeId);
    const code =
      input.code ??
      (await allocateFreeCode(tx, tenantId, 'item', async (c) => {
        const [row] = await tx
          .select({ id: items.id })
          .from(items)
          .where(and(eq(items.tenantId, tenantId), eq(items.code, c)))
          .limit(1);
        return row !== undefined;
      }));
    const id = randomUUID();
    try {
      await tx.insert(items).values({
        id,
        tenantId,
        code,
        name: input.name,
        description: input.description ?? null,
        itemType: input.itemType,
        unit: input.unit ?? (input.itemType === 'service' ? 'hour' : 'unit'),
        sellingPrice: input.sellingPrice ?? '0',
        purchaseCost: input.purchaseCost ?? null,
        defaultTaxCodeId: input.defaultTaxCodeId ?? null,
      });
    } catch (err) {
      throw mapItemCodeConflict(err);
    }
    const created = await this.get(id);
    await this.audit.record({
      action: 'item.created',
      entityType: 'item',
      entityId: id,
      entityRef: `${created.code} ${created.name}`,
      after: created,
    });
    return created;
  }

  /** ITM-004: changing an item never changes existing documents (their lines are snapshots). */
  async update(id: string, input: UpdateItemInput): Promise<ItemView> {
    const before = await this.get(id);
    if (input.defaultTaxCodeId) await this.assertTaxCode(input.defaultTaxCodeId);
    try {
      await ctx()
        .tx.update(items)
        .set(input)
        .where(and(eq(items.tenantId, currentTenant().id), eq(items.id, id)));
    } catch (err) {
      throw mapItemCodeConflict(err);
    }
    const after = await this.get(id);
    const changed = Object.keys(input) as (keyof ItemView)[];
    await this.audit.record({
      action: 'item.updated',
      entityType: 'item',
      entityId: id,
      entityRef: `${after.code} ${after.name}`,
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    });
    return after;
  }

  async listCategories(query: ListCategoriesQuery): Promise<CategoryView[]> {
    const rows = await ctx()
      .tx.select()
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.tenantId, currentTenant().id),
          query.status === 'all' ? undefined : eq(expenseCategories.status, query.status),
        ),
      )
      .orderBy(asc(expenseCategories.name));
    return rows.map(stripTenant);
  }

  async createCategory(input: CreateCategoryInput): Promise<CategoryView> {
    const { tx } = ctx();
    let row;
    try {
      [row] = await tx
        .insert(expenseCategories)
        .values({
          tenantId: currentTenant().id,
          name: input.name,
          categoryType: input.categoryType,
        })
        .returning();
    } catch (err) {
      throw mapCategoryConflict(err, input.name);
    }
    await this.audit.record({
      action: 'expense_category.created',
      entityType: 'expense_category',
      entityId: row!.id,
      entityRef: row!.name,
      after: { name: row!.name, categoryType: row!.categoryType },
    });
    return stripTenant(row!);
  }

  /** Categories are renamed or deactivated, never deleted (S3-8). */
  async updateCategory(id: string, input: UpdateCategoryInput): Promise<CategoryView> {
    const { tx } = ctx();
    const [before] = await tx
      .select()
      .from(expenseCategories)
      .where(and(eq(expenseCategories.tenantId, currentTenant().id), eq(expenseCategories.id, id)))
      .limit(1);
    if (!before) throw notFound('Expense category');
    let row;
    try {
      [row] = await tx
        .update(expenseCategories)
        .set(input)
        .where(eq(expenseCategories.id, id))
        .returning();
    } catch (err) {
      throw mapCategoryConflict(err, input.name ?? before.name);
    }
    const changed = Object.keys(input) as (keyof CategoryView)[];
    await this.audit.record({
      action: 'expense_category.updated',
      entityType: 'expense_category',
      entityId: id,
      entityRef: row!.name,
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(changed.map((k) => [k, row![k]])),
    });
    return stripTenant(row!);
  }

  private async assertTaxCode(taxCodeId: string): Promise<void> {
    const [row] = await ctx()
      .tx.select({ active: taxCodes.active })
      .from(taxCodes)
      .where(eq(taxCodes.id, taxCodeId))
      .limit(1);
    if (!row?.active) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Choose one of your tax codes',
        details: [{ field: 'defaultTaxCodeId', message: 'Choose one of your tax codes' }],
      });
    }
  }
}

function stripTenant<T extends { tenantId: string }>(row: T): Omit<T, 'tenantId'> {
  const { tenantId: _t, ...rest } = row;
  return rest;
}

function mapItemCodeConflict(err: unknown): unknown {
  if (isUniqueViolation(err, 'items_tenant_code_key')) {
    return new ConflictException({
      code: 'DUPLICATE',
      message: 'This product or service code is already used',
      details: [{ field: 'code', message: 'This code is already used' }],
    });
  }
  return err;
}

function mapCategoryConflict(err: unknown, name: string): unknown {
  if (isUniqueViolation(err, 'expense_categories_tenant_name_key')) {
    return new ConflictException({
      code: 'DUPLICATE',
      message: `There is already a category called ${name}`,
      details: [{ field: 'name', message: 'This name is already used' }],
    });
  }
  return err;
}
