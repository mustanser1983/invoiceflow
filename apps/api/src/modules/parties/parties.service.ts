import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, count, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  customers,
  suppliers,
  tenantSettings,
  type DocumentType,
  type PartyTable,
} from '../../infrastructure/db/schema/index.js';
import { ctx, currentTenant } from '../../common/context/request-context.js';
import { likePattern, orderBy, Paginated } from '../../common/pagination.js';
import { isUniqueViolation } from '../../common/pg-errors.js';
import { AuditService } from '../audit/audit.service.js';
import { allocateFreeCode } from '../numbering/numbering.js';
import type {
  CreatePartyInput,
  DuplicatesQuery,
  ListPartiesQuery,
  UpdatePartyInput,
} from './parties.dto.js';

export type PartyView = Omit<PartyTable['$inferSelect'], 'tenantId'>;

export interface DuplicateMatch {
  id: string;
  code: string;
  name: string;
  email: string | null;
  taxRegistrationNumber: string | null;
  status: string;
  matchedOn: ('name' | 'email' | 'taxRegistrationNumber')[];
}

export type PartyKind = 'customer' | 'supplier';

const CONFIG: Record<PartyKind, { table: PartyTable; documentType: DocumentType; label: string }> =
  {
    customer: { table: customers, documentType: 'customer', label: 'Customer' },
    // Same column layout; see partyTable() in schema/master-data.ts.
    supplier: {
      table: suppliers as unknown as PartyTable,
      documentType: 'supplier',
      label: 'Supplier',
    },
  };

/** Name similarity (pg_trgm) at or above which two names are flagged as possible duplicates. */
const NAME_SIMILARITY = 0.6;

function toView(row: PartyTable['$inferSelect']): PartyView {
  const { tenantId: _t, ...view } = row;
  return view;
}

/** Customers and suppliers: CUS-001 – CUS-009 and SUP-001 – SUP-008. */
export class PartiesService {
  private readonly table: PartyTable;
  private readonly documentType: DocumentType;
  private readonly label: string;

  constructor(
    private readonly kind: PartyKind,
    private readonly audit: AuditService,
  ) {
    ({ table: this.table, documentType: this.documentType, label: this.label } = CONFIG[kind]);
  }

  async list(query: ListPartiesQuery): Promise<Paginated<PartyView>> {
    const t = this.table;
    const filters: SQL[] = [eq(t.tenantId, currentTenant().id)];
    if (query.status !== 'all') filters.push(eq(t.status, query.status));
    if (query.search) {
      const p = likePattern(query.search);
      filters.push(
        or(
          ilike(t.name, p),
          ilike(t.code, p),
          ilike(sql`${t.email}::text`, p),
          ilike(t.phone, p),
          ilike(t.taxRegistrationNumber, p),
          ilike(t.contactPerson, p),
        )!,
      );
    }
    const where = and(...filters);
    const { tx } = ctx();
    const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(t).where(where);
    const rows = await tx
      .select()
      .from(t)
      .where(where)
      .orderBy(orderBy(query.sort, { name: t.name, code: t.code, createdAt: t.createdAt }), t.id)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return Paginated.of(rows.map(toView), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<PartyView> {
    const [row] = await ctx()
      .tx.select()
      .from(this.table)
      .where(and(eq(this.table.tenantId, currentTenant().id), eq(this.table.id, id)))
      .limit(1);
    if (!row) throw this.notFound();
    return toView(row);
  }

  async create(input: CreatePartyInput): Promise<PartyView> {
    const { tx } = ctx();
    const tenantId = currentTenant().id;
    const code =
      input.code ??
      (await allocateFreeCode(tx, tenantId, this.documentType, (c) => this.codeTaken(c)));
    const id = randomUUID();
    try {
      await tx.insert(this.table).values({
        id,
        tenantId,
        code,
        name: input.name,
        contactPerson: input.contactPerson ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? {},
        taxRegistrationNumber: input.taxRegistrationNumber ?? null,
        paymentTermsDays: input.paymentTermsDays ?? (await this.defaultPaymentTerms()),
        notes: input.notes ?? null,
      });
    } catch (err) {
      throw this.mapCodeConflict(err, code);
    }
    const created = await this.get(id);
    await this.audit.record({
      action: `${this.kind}.created`,
      entityType: this.kind,
      entityId: id,
      entityRef: `${created.code} ${created.name}`,
      after: created,
    });
    return created;
  }

  /** Includes deactivation (status: inactive). Records with history are never deleted. */
  async update(id: string, input: UpdatePartyInput): Promise<PartyView> {
    const before = await this.get(id);
    try {
      await ctx()
        .tx.update(this.table)
        .set(input)
        .where(and(eq(this.table.tenantId, currentTenant().id), eq(this.table.id, id)));
    } catch (err) {
      throw this.mapCodeConflict(err, input.code);
    }
    const after = await this.get(id);
    const changed = Object.keys(input) as (keyof PartyView)[];
    await this.audit.record({
      action:
        input.status && input.status !== before.status
          ? `${this.kind}.${input.status === 'inactive' ? 'deactivated' : 'reactivated'}`
          : `${this.kind}.updated`,
      entityType: this.kind,
      entityId: id,
      entityRef: `${after.code} ${after.name}`,
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    });
    return after;
  }

  /** CUS-008: possible duplicates by similar name, same email or same TRN. Warning only. */
  async findDuplicates(query: DuplicatesQuery): Promise<DuplicateMatch[]> {
    const t = this.table;
    const nameMatch = query.name
      ? sql<boolean>`(lower(${t.name}) = lower(${query.name}) OR similarity(${t.name}, ${query.name}) >= ${NAME_SIMILARITY})`
      : sql<boolean>`false`;
    const emailMatch = query.email
      ? sql<boolean>`${t.email} = ${query.email}`
      : sql<boolean>`false`;
    const trnMatch = query.taxRegistrationNumber
      ? sql<boolean>`${t.taxRegistrationNumber} = ${query.taxRegistrationNumber}`
      : sql<boolean>`false`;

    const rows = await ctx()
      .tx.select({
        id: t.id,
        code: t.code,
        name: t.name,
        email: t.email,
        taxRegistrationNumber: t.taxRegistrationNumber,
        status: t.status,
        byName: nameMatch,
        byEmail: emailMatch,
        byTrn: trnMatch,
      })
      .from(t)
      .where(
        and(
          eq(t.tenantId, currentTenant().id),
          query.excludeId ? ne(t.id, query.excludeId) : undefined,
          or(nameMatch, emailMatch, trnMatch),
        ),
      )
      .orderBy(t.name)
      .limit(10);

    return rows.map(({ byName, byEmail, byTrn, ...r }) => ({
      ...r,
      matchedOn: [
        ...(byName ? (['name'] as const) : []),
        ...(byEmail ? (['email'] as const) : []),
        ...(byTrn ? (['taxRegistrationNumber'] as const) : []),
      ],
    }));
  }

  private async codeTaken(code: string): Promise<boolean> {
    const [row] = await ctx()
      .tx.select({ id: this.table.id })
      .from(this.table)
      .where(and(eq(this.table.tenantId, currentTenant().id), eq(this.table.code, code)))
      .limit(1);
    return row !== undefined;
  }

  private async defaultPaymentTerms(): Promise<number> {
    if (this.kind !== 'customer') return 30;
    const [row] = await ctx()
      .tx.select({ value: tenantSettings.settingValue })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, currentTenant().id),
          eq(tenantSettings.settingKey, 'sales.default_payment_terms_days'),
        ),
      )
      .limit(1);
    return typeof row?.value === 'number' ? row.value : 30;
  }

  private mapCodeConflict(err: unknown, code: string | undefined): unknown {
    const name = this.kind === 'customer' ? 'customers' : 'suppliers';
    if (isUniqueViolation(err, `${name}_tenant_code_key`)) {
      return new ConflictException({
        code: 'DUPLICATE',
        message: `${this.label} code ${code ?? ''} is already used`.replace('  ', ' '),
        details: [{ field: 'code', message: 'This code is already used' }],
      });
    }
    return err;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message: `${this.label} not found` });
  }
}
