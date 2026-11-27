import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { DbService } from './db.service.js';
import type * as schema from './schema/index.js';

export type Tx = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export interface DbContext {
  tenantId?: string;
  userId?: string;
  /** `<provider>:<provider user id>`, e.g. `firebase:abc123`. */
  authSubject?: string;
}

/** The database role every API transaction runs as. RLS always applies to it. */
export const APP_DB_ROLE = 'invoiceflow_app';

/**
 * Runs work in a transaction that is restricted to the invoiceflow_app role and carries the
 * caller's tenant/user context. Everything is transaction-local (SET LOCAL / set_config(..., true)),
 * so pooled connections never keep context between requests (DATABASE_ERD.md §2.1).
 */
@Injectable()
export class TransactionManager {
  constructor(private readonly dbService: DbService) {}

  async run<T>(context: DbContext, work: (tx: Tx) => Promise<T>): Promise<T> {
    const db = this.dbService.db;
    if (!db) {
      throw new ServiceUnavailableException({
        code: 'DATABASE_NOT_CONFIGURED',
        message: 'Database connection is not configured',
      });
    }
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${APP_DB_ROLE}`));
      await setContext(tx, context);
      return work(tx);
    });
  }
}

/** Sets (or replaces) the context inside an open transaction. Empty string clears a value. */
export async function setContext(tx: Tx, context: DbContext): Promise<void> {
  await tx.execute(sql`
    SELECT set_config('app.tenant_id', ${context.tenantId ?? ''}, true),
           set_config('app.user_id', ${context.userId ?? ''}, true),
           set_config('app.auth_subject', ${context.authSubject ?? ''}, true)
  `);
}
