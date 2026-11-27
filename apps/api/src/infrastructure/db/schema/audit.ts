import { sql } from 'drizzle-orm';
import { check, index, inet, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Append-only audit trail (DATABASE_ERD.md §4.10). The app role has INSERT and SELECT only.
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL for platform events. */
    tenantId: uuid('tenant_id'),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    entityRef: text('entity_ref'),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    reason: text('reason'),
    requestId: text('request_id'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('audit_logs_actor_type_chk', sql`${t.actorType} IN ('user','super_admin','system')`),
    index('audit_logs_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    index('audit_logs_entity_idx').on(t.tenantId, t.entityType, t.entityId),
  ],
);
