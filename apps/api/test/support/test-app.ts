import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { AUTH_PROVIDER } from '../../src/infrastructure/auth/auth-provider.js';
import { FakeAuthProvider } from './fake-auth.provider.js';

/**
 * Integration tests need a disposable Postgres database (all data in it is deleted).
 * Set TEST_DATABASE_URL; CI provides one. Without it these suites are skipped.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim() || undefined;
export const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Owner connection for setup and assertions. It is NOT subject to RLS. */
export function ownerPool(): Pool {
  return new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
}

export async function migrateTestDb(pool: Pool): Promise<void> {
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });
}

/** Deletes all tenant and user data; keeps seeded permissions and system roles. */
export async function resetTestDb(pool: Pool): Promise<void> {
  await pool.query(`
    DELETE FROM audit_logs;
    DELETE FROM tenant_tax_settings;
    DELETE FROM tax_rates WHERE tax_code_id IN (SELECT id FROM tax_codes WHERE tenant_id IS NOT NULL);
    DELETE FROM tax_codes WHERE tenant_id IS NOT NULL;
    DELETE FROM idempotency_keys;
    DELETE FROM document_sequences;
    DELETE FROM tenant_settings;
    DELETE FROM user_invitations;
    -- The keep-an-owner trigger would block wiping every membership; only the owner can do this.
    ALTER TABLE tenant_memberships DISABLE TRIGGER tenant_memberships_keep_an_owner;
    DELETE FROM tenant_memberships;
    ALTER TABLE tenant_memberships ENABLE TRIGGER tenant_memberships_keep_an_owner;
    DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE tenant_id IS NOT NULL);
    DELETE FROM roles WHERE tenant_id IS NOT NULL;
    DELETE FROM users;
    DELETE FROM tenants;
  `);
}

export async function createTestApp(): Promise<{
  app: INestApplication;
  auth: FakeAuthProvider;
}> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const auth = new FakeAuthProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AUTH_PROVIDER)
    .useValue(auth)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return { app, auth };
}
