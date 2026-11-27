import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { DbService } from '../src/infrastructure/db/db.service.js';
import { tenantSettings } from '../src/infrastructure/db/schema/index.js';
import { APP_DB_ROLE, TransactionManager } from '../src/infrastructure/db/transaction-manager.js';
import * as schema from '../src/infrastructure/db/schema/index.js';
import {
  describeWithDb,
  migrateTestDb,
  ownerPool,
  resetTestDb,
  TEST_DATABASE_URL,
} from './support/test-app.js';

/** Builds a TransactionManager over a single-connection pool, so every call reuses one session. */
function singleConnectionManager(): { tm: TransactionManager; pool: Pool } {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  const dbService = { db: drizzle(pool, { schema }) } as unknown as DbService;
  return { tm: new TransactionManager(dbService), pool };
}

async function seedTenant(owner: Pool, name: string): Promise<string> {
  const id = randomUUID();
  await owner.query(`INSERT INTO tenants (id, legal_name) VALUES ($1, $2)`, [id, name]);
  await owner.query(
    `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value) VALUES ($1, 'k', '"v"')`,
    [id],
  );
  return id;
}

describeWithDb('Row-level security (S1-6, S1-7)', () => {
  let owner: Pool;

  beforeAll(async () => {
    owner = ownerPool();
    await migrateTestDb(owner);
    await resetTestDb(owner);
  });

  afterAll(async () => {
    await owner.end();
  });

  it('every table with tenant_id has RLS enabled and at least one policy', async () => {
    const { rows } = await owner.query<{ table: string; rls: boolean; policies: number }>(`
      SELECT c.relname AS table, c.relrowsecurity AS rls,
             (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM information_schema.columns col
                    WHERE col.table_schema = 'public' AND col.table_name = c.relname
                      AND col.column_name = 'tenant_id')
      ORDER BY 1
    `);
    expect(rows.length).toBeGreaterThan(0);
    const unprotected = rows.filter((r) => !r.rls || r.policies === 0).map((r) => r.table);
    expect(unprotected).toEqual([]);
  });

  it('the app role cannot bypass RLS and owns no tables', async () => {
    const { rows } = await owner.query(
      `SELECT rolbypassrls, rolsuper,
              (SELECT count(*)::int FROM pg_tables WHERE tableowner = $1) AS owned
       FROM pg_roles WHERE rolname = $1`,
      [APP_DB_ROLE],
    );
    expect(rows[0]).toEqual({ rolbypassrls: false, rolsuper: false, owned: 0 });
  });

  it('the app role cannot update or delete audit logs', async () => {
    const { rows } = await owner.query(
      `SELECT has_table_privilege($1, 'audit_logs', 'UPDATE') AS upd,
              has_table_privilege($1, 'audit_logs', 'DELETE') AS del,
              has_table_privilege($1, 'audit_logs', 'INSERT') AS ins`,
      [APP_DB_ROLE],
    );
    expect(rows[0]).toEqual({ upd: false, del: false, ins: true });
  });

  describe('with two tenants', () => {
    let tenantA: string;
    let tenantB: string;
    let tm: TransactionManager;
    let pool: Pool;

    beforeAll(async () => {
      tenantA = await seedTenant(owner, 'Tenant A');
      tenantB = await seedTenant(owner, 'Tenant B');
      ({ tm, pool } = singleConnectionManager());
    });

    afterAll(async () => {
      await pool.end();
    });

    it('only shows the current tenant’s rows', async () => {
      const rows = await tm.run({ tenantId: tenantA }, (tx) => tx.select().from(tenantSettings));
      expect(rows.map((r) => r.tenantId)).toEqual([tenantA]);
    });

    it('shows nothing when no tenant is set', async () => {
      const rows = await tm.run({}, (tx) => tx.select().from(tenantSettings));
      expect(rows).toEqual([]);
    });

    it('rejects writing a row for another tenant', async () => {
      await expect(
        tm.run({ tenantId: tenantA }, (tx) =>
          tx.insert(tenantSettings).values({
            tenantId: tenantB,
            settingKey: 'sneaky',
            settingValue: true,
          }),
        ),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
    });

    it('cannot change another tenant’s rows (update silently matches nothing)', async () => {
      const updated = await tm.run({ tenantId: tenantA }, (tx) =>
        tx
          .update(tenantSettings)
          .set({ settingValue: 'hacked' })
          .where(sql`${tenantSettings.tenantId} = ${tenantB}`)
          .returning(),
      );
      expect(updated).toEqual([]);
      const { rows } = await owner.query(
        `SELECT setting_value FROM tenant_settings WHERE tenant_id = $1`,
        [tenantB],
      );
      expect(rows[0].setting_value).toBe('v');
    });

    it('does not leak role or tenant context to the next use of a pooled connection', async () => {
      await tm.run({ tenantId: tenantA, userId: randomUUID() }, async (tx) => {
        const { rows } = await tx.execute<{ role: string; tenant: string }>(
          sql`SELECT current_user AS role, current_setting('app.tenant_id', true) AS tenant`,
        );
        expect(rows[0]).toEqual({ role: APP_DB_ROLE, tenant: tenantA });
      });

      // Same single connection, outside any managed transaction.
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `SELECT current_user AS role,
                  coalesce(current_setting('app.tenant_id', true), '') AS tenant,
                  coalesce(current_setting('app.user_id', true), '') AS "user"`,
        );
        expect(rows[0].role).not.toBe(APP_DB_ROLE);
        expect(rows[0].tenant).toBe('');
        expect(rows[0].user).toBe('');
      } finally {
        client.release();
      }

      // And a fresh managed transaction with tenant B sees only B.
      const rows = await tm.run({ tenantId: tenantB }, (tx) => tx.select().from(tenantSettings));
      expect(rows.map((r) => r.tenantId)).toEqual([tenantB]);
    });

    it('rolls back everything when the work fails', async () => {
      const key = `rollback-${randomUUID()}`;
      await expect(
        tm.run({ tenantId: tenantA }, async (tx) => {
          await tx
            .insert(tenantSettings)
            .values({ tenantId: tenantA, settingKey: key, settingValue: 1 });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      const { rowCount } = await owner.query(
        `SELECT 1 FROM tenant_settings WHERE setting_key = $1`,
        [key],
      );
      expect(rowCount).toBe(0);
    });
  });
});
