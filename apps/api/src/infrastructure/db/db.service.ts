import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { loadEnv } from '../../config/env.js';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

/**
 * Owns the Postgres pool. In Sprint 1 a TransactionManager will wrap every tenant request in a
 * transaction that first runs set_config('app.tenant_id', ..., true). See DATABASE_ERD.md §2.1.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private readonly pool: Pool | undefined;
  readonly db: Database | undefined;

  constructor() {
    const { DATABASE_URL } = loadEnv();
    if (!DATABASE_URL) {
      this.logger.warn('DATABASE_URL is not set; database features are disabled.');
      return;
    }
    this.pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
    this.db = drizzle(this.pool, { schema });
  }

  get isConfigured(): boolean {
    return this.db !== undefined;
  }

  /** Runs SELECT 1 and returns the round-trip time in milliseconds. */
  async ping(): Promise<number> {
    if (!this.db) throw new Error('Database is not configured');
    const started = Date.now();
    await this.db.execute(sql`select 1`);
    return Date.now() - started;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
