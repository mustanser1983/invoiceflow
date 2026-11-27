import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { FakeAuthProvider } from './support/fake-auth.provider.js';
import { token } from './support/fake-auth.provider.js';
import {
  createTestApp,
  describeWithDb,
  migrateTestDb,
  ownerPool,
  resetTestDb,
} from './support/test-app.js';

describeWithDb('Auth, tenants and isolation over HTTP (S1-2 – S1-10)', () => {
  let app: INestApplication;
  let auth: FakeAuthProvider;
  let owner: Pool;
  const http = () => request(app.getHttpServer());

  function register(uid: string, fullName = `User ${uid}`) {
    return http().post('/api/v1/auth/register').set('Authorization', token(uid)).send({ fullName });
  }

  async function createTenant(uid: string, legalName: string): Promise<string> {
    const res = await http()
      .post('/api/v1/tenants')
      .set('Authorization', token(uid))
      .send({ legalName, address: { emirate: 'Dubai', city: 'Dubai' } })
      .expect(201);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    owner = ownerPool();
    await migrateTestDb(owner);
    await resetTestDb(owner);
    ({ app, auth } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  describe('authentication', () => {
    it('rejects requests without a token', async () => {
      const res = await http().get('/api/v1/auth/me').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects an invalid token', async () => {
      const res = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer nope')
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('asks signed-in but unregistered users to finish sign-up', async () => {
      const res = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', token('ghost'))
        .expect(403);
      expect(res.body.error.code).toBe('USER_NOT_REGISTERED');
    });

    it('validates registration input', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .set('Authorization', token('val'))
        .send({ fullName: 'A', extra: true })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('registers a user once and is idempotent for the same identity', async () => {
      const first = await register('alice', 'Alice Owner').expect(201);
      expect(first.body.data.user).toMatchObject({
        fullName: 'Alice Owner',
        email: 'alice@example.test',
        emailVerified: true,
      });
      expect(first.body.data.memberships).toEqual([]);
      const again = await register('alice', 'Alice Owner').expect(200);
      expect(again.body.data.user.id).toBe(first.body.data.user.id);
    });

    it('rejects a second identity with an email already in use', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .set('Authorization', token('alice-2', 'alice@example.test'))
        .send({ fullName: 'Impostor' })
        .expect(409);
      expect(res.body.error.code).toBe('EMAIL_IN_USE');
    });

    it('logs out by revoking sessions at the provider', async () => {
      await http().post('/api/v1/auth/logout').set('Authorization', token('alice')).expect(204);
      expect(auth.revoked).toContain('alice');
    });

    it('records audit events without secrets', async () => {
      const { rows } = await owner.query(
        `SELECT action, after_data::text AS after FROM audit_logs WHERE action LIKE 'user.%' ORDER BY created_at`,
      );
      expect(rows.map((r) => r.action)).toEqual(
        expect.arrayContaining(['user.registered', 'user.logged_out']),
      );
      for (const r of rows) expect(r.after ?? '').not.toMatch(/Bearer|token/i);
    });
  });

  describe('tenants', () => {
    let tenantA: string;
    let tenantB: string;

    beforeAll(async () => {
      await register('bob', 'Bob Owner').expect(201);
      tenantA = await createTenant('alice', 'Alice Trading LLC');
      tenantB = await createTenant('bob', 'Bob Services FZE');
    });

    it('makes the creator the Owner with every permission', async () => {
      const me = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', token('alice'))
        .expect(200);
      const memberships = me.body.data.memberships;
      expect(memberships).toHaveLength(1);
      expect(memberships[0]).toMatchObject({
        tenantId: tenantA,
        legalName: 'Alice Trading LLC',
        isOwner: true,
        role: { code: 'owner' },
      });
      expect(memberships[0].permissions).toEqual(
        expect.arrayContaining(['tenant.update', 'invoice.issue', 'subscription.manage']),
      );
    });

    it('creates default settings and numbering for a new business', async () => {
      const { rows: seq } = await owner.query(
        `SELECT document_type, prefix, next_number FROM document_sequences WHERE tenant_id = $1`,
        [tenantA],
      );
      expect(seq).toHaveLength(11);
      expect(seq).toEqual(
        expect.arrayContaining([{ document_type: 'invoice', prefix: 'INV-', next_number: '1' }]),
      );
      const { rowCount } = await owner.query(`SELECT 1 FROM tenant_settings WHERE tenant_id = $1`, [
        tenantA,
      ]);
      expect(rowCount).toBeGreaterThan(0);
    });

    it('defaults new businesses to the UAE and AED', async () => {
      const res = await http()
        .get(`/api/v1/tenants/${tenantA}`)
        .set('Authorization', token('alice'))
        .expect(200);
      expect(res.body.data).toMatchObject({
        legalName: 'Alice Trading LLC',
        countryCode: 'AE',
        baseCurrency: 'AED',
        timezone: 'Asia/Dubai',
        address: { emirate: 'Dubai', city: 'Dubai' },
      });
    });

    it('lists only the caller’s own businesses', async () => {
      const res = await http()
        .get('/api/v1/tenants')
        .set('Authorization', token('alice'))
        .expect(200);
      expect(res.body.data.map((m: { tenantId: string }) => m.tenantId)).toEqual([tenantA]);
    });

    it('denies reading another business (XC-2)', async () => {
      const res = await http()
        .get(`/api/v1/tenants/${tenantB}`)
        .set('Authorization', token('alice'))
        .expect(403);
      expect(res.body.error.code).toBe('TENANT_ACCESS_DENIED');
    });

    it('denies updating another business and leaves it unchanged', async () => {
      await http()
        .patch(`/api/v1/tenants/${tenantB}`)
        .set('Authorization', token('alice'))
        .send({ legalName: 'Hijacked' })
        .expect(403);
      const { rows } = await owner.query(`SELECT legal_name FROM tenants WHERE id = $1`, [tenantB]);
      expect(rows[0].legal_name).toBe('Bob Services FZE');
    });

    it('denies a mismatched X-Tenant-Id header', async () => {
      await http()
        .get(`/api/v1/tenants/${tenantA}`)
        .set('Authorization', token('alice'))
        .set('X-Tenant-Id', tenantB)
        .expect(403);
    });

    it('does not reveal whether a malformed or unknown tenant id exists', async () => {
      const bad = await http()
        .get('/api/v1/tenants/not-a-uuid')
        .set('Authorization', token('alice'))
        .expect(403);
      const unknown = await http()
        .get(`/api/v1/tenants/${randomUUID()}`)
        .set('Authorization', token('alice'))
        .expect(403);
      expect(bad.body.error.code).toBe(unknown.body.error.code);
    });

    it('updates the caller’s business and audits only the changed fields', async () => {
      const res = await http()
        .patch(`/api/v1/tenants/${tenantA}`)
        .set('Authorization', token('alice'))
        .send({ tradingName: 'Alice Trading', financialYearStart: 4 })
        .expect(200);
      expect(res.body.data).toMatchObject({ tradingName: 'Alice Trading', financialYearStart: 4 });

      const { rows } = await owner.query(
        `SELECT before_data, after_data, actor_id FROM audit_logs
         WHERE tenant_id = $1 AND action = 'tenant.updated'`,
        [tenantA],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].before_data).toEqual({ tradingName: null, financialYearStart: 1 });
      expect(rows[0].after_data).toEqual({ tradingName: 'Alice Trading', financialYearStart: 4 });
    });

    it('rejects countries other than the UAE for now', async () => {
      await http()
        .post('/api/v1/tenants')
        .set('Authorization', token('alice'))
        .send({ legalName: 'Elsewhere Ltd', countryCode: 'GB' })
        .expect(400);
    });
  });

  describe('permissions (S1-8)', () => {
    let tenantA: string;
    let customRole: string;

    beforeAll(async () => {
      await register('carol', 'Carol Sales').expect(201);
      const { rows } = await owner.query(
        `SELECT t.id FROM tenants t WHERE t.legal_name = 'Alice Trading LLC'`,
      );
      tenantA = rows[0].id;
      const carol = await owner.query(`SELECT id FROM users WHERE auth_provider_id = 'carol'`);

      // A custom role that can view but not edit the business.
      customRole = randomUUID();
      await owner.query(`INSERT INTO roles (id, tenant_id, name) VALUES ($1, $2, 'Viewer')`, [
        customRole,
        tenantA,
      ]);
      await owner.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, id FROM permissions WHERE permission_code = 'tenant.view'`,
        [customRole],
      );
      await owner.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
        [tenantA, carol.rows[0].id, customRole],
      );
    });

    it('allows what the role grants', async () => {
      await http()
        .get(`/api/v1/tenants/${tenantA}`)
        .set('Authorization', token('carol'))
        .expect(200);
    });

    it('denies what the role does not grant', async () => {
      const res = await http()
        .patch(`/api/v1/tenants/${tenantA}`)
        .set('Authorization', token('carol'))
        .send({ tradingName: 'Nope' })
        .expect(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('applies a newly granted permission on the next request', async () => {
      await owner.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, id FROM permissions WHERE permission_code = 'tenant.update'`,
        [customRole],
      );
      await http()
        .patch(`/api/v1/tenants/${tenantA}`)
        .set('Authorization', token('carol'))
        .send({ tradingName: 'Alice Trading (edited by Carol)' })
        .expect(200);
    });

    it('shows a custom role in the member’s tenant list', async () => {
      const res = await http()
        .get('/api/v1/tenants')
        .set('Authorization', token('carol'))
        .expect(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({
          tenantId: tenantA,
          role: expect.objectContaining({ name: 'Viewer' }),
        }),
      ]);
    });

    it('rejects assigning another tenant’s role to a membership', async () => {
      const { rows } = await owner.query(
        `SELECT id FROM tenants WHERE legal_name = 'Bob Services FZE'`,
      );
      const dave = randomUUID();
      await owner.query(
        `INSERT INTO users (id, auth_provider, auth_provider_id, full_name, email)
         VALUES ($1, 'test', 'dave', 'Dave', 'dave@example.test')`,
        [dave],
      );
      await expect(
        owner.query(
          `INSERT INTO tenant_memberships (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
          [rows[0].id, dave, customRole],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });
});
