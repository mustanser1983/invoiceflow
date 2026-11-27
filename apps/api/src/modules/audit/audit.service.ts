import { Injectable } from '@nestjs/common';
import { auditLogs } from '../../infrastructure/db/schema/index.js';
import { ctx } from '../../common/context/request-context.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  entityRef?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  /** Defaults to the request's tenant. Pass null for tenant-less events. */
  tenantId?: string | null;
}

/** Keys that must never be written to the audit log (AUD-003). */
const SECRET_KEYS =
  /pass(word)?|token|secret|authorization|cookie|api[_-]?key|account[_-]?number|iban/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_KEYS.test(k) ? '[REDACTED]' : redact(v),
      ]),
    );
  }
  return value;
}

/** Writes audit rows in the request's own transaction, so they commit or roll back with it. */
@Injectable()
export class AuditService {
  async record(entry: AuditEntry): Promise<void> {
    const { tx, user, tenant, requestId, ipAddress, userAgent } = ctx();
    await tx.insert(auditLogs).values({
      tenantId: entry.tenantId === undefined ? (tenant?.id ?? null) : entry.tenantId,
      actorType: 'user',
      actorId: user?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      entityRef: entry.entityRef ?? null,
      beforeData: entry.before ? redact(entry.before) : null,
      afterData: entry.after ? redact(entry.after) : null,
      reason: entry.reason ?? null,
      requestId: requestId ?? null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent?.slice(0, 500) ?? null,
    });
  }
}
