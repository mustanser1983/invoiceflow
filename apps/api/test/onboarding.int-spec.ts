import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { token } from './support/fake-auth.provider.js';
import {
  createTestApp,
  describeWithDb,
  migrateTestDb,
  ownerPool,
  resetTestDb,
} from './support/test-app.js';

describeWithDb('Onboarding, tax, settings, numbering and users (Sprint 2)', () => {
  let app: INestApplication;
  let owner: Pool;
  let tenantA: string;
  let tenantB: string;
  const http = () => request(app.getHttpServer());

  /** Request helper: as `uid`, inside `tenant` (X-Tenant-Id). */
  const as = (uid: string, tenant?: string, email?: string) => {
    const auth = token(uid, email);
    const withHeaders = (t: request.Test) => {
      t.set('Authorization', auth);
      if (tenant) t.set('X-Tenant-Id', tenant);
      return t;
    };
    return {
      get: (url: string) => withHeaders(http().get(url)),
      post: (url: string, body?: object) => withHeaders(http().post(url)).send(body ?? {}),
      patch: (url: string, body: object) => withHeaders(http().patch(url)).send(body),
      delete: (url: string) => withHeaders(http().delete(url)),
    };
  };

  async function registerAndCreate(uid: string, legalName: string, address?: object) {
    await as(uid)
      .post('/api/v1/auth/register', { fullName: `${uid} owner` })
      .expect(201);
    const res = await as(uid)
      .post('/api/v1/tenants', { legalName, ...(address && { address }) })
      .expect(201);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    owner = ownerPool();
    await migrateTestDb(owner);
    await resetTestDb(owner);
    ({ app } = await createTestApp());
    tenantA = await registerAndCreate('olivia', 'Olivia Consulting');
    tenantB = await registerAndCreate('oscar', 'Oscar Trading', {
      emirate: 'Sharjah',
      city: 'Sharjah',
    });
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  describe('VAT settings (S2-3, S2-4)', () => {
    const codeId = async (code: string) => {
      const res = await as('olivia', tenantA).get('/api/v1/tax/codes').expect(200);
      return res.body.data.find((c: { code: string }) => c.code === code).id as string;
    };

    it('starts new businesses as not VAT registered, charging no VAT on sales', async () => {
      const res = await as('olivia', tenantA).get('/api/v1/tax/settings').expect(200);
      expect(res.body.data).toMatchObject({
        isVatRegistered: false,
        taxRegistrationNumber: null,
        reportingFrequency: 'quarterly',
        defaultSalesTaxCodeId: await codeId('OS'),
        defaultPurchaseTaxCodeId: await codeId('SR-NR'),
      });
    });

    it('lists the UAE codes with today’s rate, read from data', async () => {
      const res = await as('olivia', tenantA).get('/api/v1/tax/codes').expect(200);
      const byCode = Object.fromEntries(
        res.body.data.map((c: { code: string; currentRate: string }) => [c.code, c.currentRate]),
      );
      expect(byCode).toMatchObject({ SR: '5.0000', ZR: '0.0000', EX: '0.0000', OS: '0.0000' });
    });

    it('requires a 15-digit TRN to register for VAT', async () => {
      const none = await as('olivia', tenantA)
        .patch('/api/v1/tax/settings', { isVatRegistered: true })
        .expect(400);
      expect(none.body.error.details[0].field).toBe('taxRegistrationNumber');
      await as('olivia', tenantA)
        .patch('/api/v1/tax/settings', { isVatRegistered: true, taxRegistrationNumber: '12345' })
        .expect(400);
    });

    it('switches default codes to standard rated when the business registers', async () => {
      const res = await as('olivia', tenantA)
        .patch('/api/v1/tax/settings', {
          isVatRegistered: true,
          taxRegistrationNumber: '100123456700003',
          registrationDate: '2024-01-01',
        })
        .expect(200);
      const sr = await codeId('SR');
      expect(res.body.data).toMatchObject({
        isVatRegistered: true,
        taxRegistrationNumber: '100123456700003',
        defaultSalesTaxCodeId: sr,
        defaultPurchaseTaxCodeId: sr,
      });
    });

    it('stops an unregistered business from defaulting to a VAT-charging sales code', async () => {
      const res = await as('oscar', tenantB)
        .patch('/api/v1/tax/settings', {
          defaultSalesTaxCodeId: (
            await as('oscar', tenantB).get('/api/v1/tax/codes')
          ).body.data.find((c: { code: string }) => c.code === 'SR').id,
        })
        .expect(400);
      expect(res.body.error.details[0].field).toBe('defaultSalesTaxCodeId');
    });

    it('lets a business add its own code, visible only to it', async () => {
      await as('olivia', tenantA)
        .post('/api/v1/tax/codes', {
          code: 'DZ',
          description: 'Designated zone supply',
          taxTreatment: 'out_of_scope',
          direction: 'sales',
          rate: '0',
          effectiveFrom: '2024-01-01',
        })
        .expect(201);
      const dup = await as('olivia', tenantA)
        .post('/api/v1/tax/codes', {
          code: 'DZ',
          description: 'Again',
          taxTreatment: 'out_of_scope',
          direction: 'sales',
          rate: '0',
          effectiveFrom: '2024-01-01',
        })
        .expect(409);
      expect(dup.body.error.code).toBe('DUPLICATE');

      const other = await as('oscar', tenantB).get('/api/v1/tax/codes').expect(200);
      expect(other.body.data.map((c: { code: string }) => c.code)).not.toContain('DZ');
    });

    it('rejects a TRN that isn’t 15 digits at the database level too', async () => {
      await expect(
        owner.query(
          `UPDATE tenant_tax_settings SET tax_registration_number = 'ABC' WHERE tenant_id = $1`,
          [tenantB],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('business settings (S2-8)', () => {
    it('returns defaults', async () => {
      const res = await as('olivia').get(`/api/v1/tenants/${tenantA}/settings`).expect(200);
      expect(res.body.data).toMatchObject({
        'locale.language': 'en',
        'sales.default_payment_terms_days': 30,
      });
    });

    it('updates known settings and rejects unknown keys or bad values', async () => {
      const res = await as('olivia')
        .patch(`/api/v1/tenants/${tenantA}/settings`, {
          'sales.default_payment_terms_days': 45,
          'locale.date_format': 'yyyy-MM-dd',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        'sales.default_payment_terms_days': 45,
        'locale.date_format': 'yyyy-MM-dd',
      });
      await as('olivia').patch(`/api/v1/tenants/${tenantA}/settings`, { 'made.up': 1 }).expect(400);
      await as('olivia')
        .patch(`/api/v1/tenants/${tenantA}/settings`, { 'sales.default_payment_terms_days': -1 })
        .expect(400);
    });
  });

  describe('document numbering (S2-5)', () => {
    it('shows the eleven sequences with a preview', async () => {
      const res = await as('olivia').get(`/api/v1/tenants/${tenantA}/numbering`).expect(200);
      expect(res.body.data).toHaveLength(11);
      expect(res.body.data[1]).toMatchObject({
        documentType: 'invoice',
        prefix: 'INV-',
        nextNumber: 1,
        preview: 'INV-00001',
      });
    });

    it('changes prefix, padding and next number', async () => {
      const res = await as('olivia')
        .patch(`/api/v1/tenants/${tenantA}/numbering`, {
          sequences: [{ documentType: 'invoice', prefix: 'OC-INV-', nextNumber: 100, padding: 4 }],
        })
        .expect(200);
      expect(
        res.body.data.find((s: { documentType: string }) => s.documentType === 'invoice'),
      ).toMatchObject({ prefix: 'OC-INV-', nextNumber: 100, preview: 'OC-INV-0100' });
    });

    it('never moves the next number backwards', async () => {
      const res = await as('olivia')
        .patch(`/api/v1/tenants/${tenantA}/numbering`, {
          sequences: [{ documentType: 'invoice', nextNumber: 50 }],
        })
        .expect(400);
      expect(res.body.error.message).toContain('100');
    });

    it('rejects lowercase prefixes and duplicate types', async () => {
      await as('olivia')
        .patch(`/api/v1/tenants/${tenantA}/numbering`, {
          sequences: [{ documentType: 'invoice', prefix: 'inv-' }],
        })
        .expect(400);
      await as('olivia')
        .patch(`/api/v1/tenants/${tenantA}/numbering`, {
          sequences: [
            { documentType: 'invoice', padding: 6 },
            { documentType: 'invoice', padding: 7 },
          ],
        })
        .expect(400);
    });
  });

  describe('completing onboarding (S2-1)', () => {
    it('lists what is missing', async () => {
      const res = await as('olivia')
        .post(`/api/v1/tenants/${tenantA}/complete-onboarding`)
        .expect(400);
      expect(res.body.error.code).toBe('ONBOARDING_INCOMPLETE');
      expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(
        'address.emirate',
      );
    });

    it('completes once the address is in, and is idempotent', async () => {
      await as('olivia')
        .patch(`/api/v1/tenants/${tenantA}`, {
          address: { line1: 'Office 12, Bay Square', city: 'Dubai', emirate: 'Dubai' },
        })
        .expect(200);
      const first = await as('olivia')
        .post(`/api/v1/tenants/${tenantA}/complete-onboarding`)
        .expect(200);
      expect(first.body.data.onboardingCompletedAt).toBeTruthy();
      const again = await as('olivia')
        .post(`/api/v1/tenants/${tenantA}/complete-onboarding`)
        .expect(200);
      expect(again.body.data.onboardingCompletedAt).toBe(first.body.data.onboardingCompletedAt);
      const settings = await as('olivia').get(`/api/v1/tenants/${tenantA}/settings`).expect(200);
      expect(settings.body.data['onboarding.step']).toBe('done');
    });
  });

  describe('users and invitations (S2-10)', () => {
    let roleIds: Record<string, string>;
    let inviteToken: string;
    let paulId: string;

    beforeAll(async () => {
      const res = await as('olivia', tenantA).get('/api/v1/roles').expect(200);
      roleIds = Object.fromEntries(
        res.body.data.map((r: { code: string; id: string }) => [r.code, r.id]),
      );
    });

    it('lists the six system roles and the permission catalogue', async () => {
      expect(Object.keys(roleIds).sort()).toEqual(
        ['accountant', 'administrator', 'cashier', 'owner', 'purchase_user', 'sales_user'].sort(),
      );
      const perms = await as('olivia', tenantA).get('/api/v1/permissions').expect(200);
      expect(perms.body.data.length).toBe(63);
    });

    it('invites someone with a role and returns a one-time token', async () => {
      const res = await as('olivia', tenantA)
        .post('/api/v1/users/invite', { email: 'Paul@Example.test', roleId: roleIds.sales_user })
        .expect(201);
      expect(res.body.data).toMatchObject({
        email: 'paul@example.test',
        role: { code: 'sales_user' },
      });
      inviteToken = res.body.data.acceptToken;
      expect(inviteToken.length).toBeGreaterThan(30);

      const { rows } = await owner.query(`SELECT token_hash FROM user_invitations`);
      expect(rows.map((r) => r.token_hash)).not.toContain(inviteToken);

      const pending = await as('olivia', tenantA).get('/api/v1/users/invitations').expect(200);
      expect(pending.body.data).toHaveLength(1);
    });

    it('does not let another business see the invitation', async () => {
      const res = await as('oscar', tenantB).get('/api/v1/users/invitations').expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('rejects accepting with a different email address', async () => {
      await as('mallory').post('/api/v1/auth/register', { fullName: 'Mallory' }).expect(201);
      const res = await as('mallory')
        .post('/api/v1/invitations/accept', { token: inviteToken })
        .expect(403);
      expect(res.body.error.code).toBe('INVITATION_EMAIL_MISMATCH');
    });

    it('lets the invited person join with the invited role', async () => {
      await as('paul', undefined, 'paul@example.test')
        .post('/api/v1/auth/register', { fullName: 'Paul Sales' })
        .expect(201);
      const res = await as('paul', undefined, 'paul@example.test')
        .post('/api/v1/invitations/accept', { token: inviteToken })
        .expect(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({
          tenantId: tenantA,
          role: expect.objectContaining({ code: 'sales_user' }),
        }),
      ]);
      const members = await as('olivia', tenantA).get('/api/v1/users').expect(200);
      paulId = members.body.data.find(
        (m: { email: string }) => m.email === 'paul@example.test',
      ).userId;
    });

    it('refuses to reuse a token', async () => {
      const res = await as('paul', undefined, 'paul@example.test')
        .post('/api/v1/invitations/accept', { token: inviteToken })
        .expect(410);
      expect(res.body.error.code).toBe('INVITATION_INVALID');
    });

    it('gives the new member only their role’s permissions', async () => {
      await as('paul', tenantA, 'paul@example.test').get('/api/v1/users').expect(403);
      await as('paul', undefined, 'paul@example.test')
        .patch(`/api/v1/tenants/${tenantA}`, { tradingName: 'Nope' })
        .expect(403);
    });

    it('refuses to invite an existing member', async () => {
      const res = await as('olivia', tenantA)
        .post('/api/v1/users/invite', { email: 'paul@example.test', roleId: roleIds.cashier })
        .expect(409);
      expect(res.body.error.code).toBe('ALREADY_MEMBER');
    });

    it('changes a member’s role', async () => {
      const res = await as('olivia', tenantA)
        .patch(`/api/v1/users/${paulId}`, { roleId: roleIds.administrator })
        .expect(200);
      expect(res.body.data.role.code).toBe('administrator');
    });

    it('only lets an owner grant owner access', async () => {
      const res = await as('paul', tenantA, 'paul@example.test')
        .patch(`/api/v1/users/${paulId}`, { roleId: roleIds.owner })
        .expect(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('keeps at least one active owner', async () => {
      const members = await as('olivia', tenantA).get('/api/v1/users').expect(200);
      const oliviaId = members.body.data.find((m: { isOwner: boolean }) => m.isOwner).userId;
      const res = await as('olivia', tenantA)
        .patch(`/api/v1/users/${oliviaId}`, { roleId: roleIds.accountant })
        .expect(409);
      expect(res.body.error.code).toBe('LAST_OWNER');

      // With a second owner, the first can step down.
      await as('olivia', tenantA)
        .patch(`/api/v1/users/${paulId}`, { roleId: roleIds.owner })
        .expect(200);
      await as('olivia', tenantA)
        .patch(`/api/v1/users/${oliviaId}`, { roleId: roleIds.accountant })
        .expect(200);
    });

    it('revokes a pending invitation', async () => {
      const created = await as('paul', tenantA, 'paul@example.test')
        .post('/api/v1/users/invite', { email: 'quinn@example.test', roleId: roleIds.cashier })
        .expect(201);
      await as('paul', tenantA, 'paul@example.test')
        .delete(`/api/v1/users/invitations/${created.body.data.id}`)
        .expect(204);
      await as('quinn', undefined, 'quinn@example.test')
        .post('/api/v1/auth/register', { fullName: 'Quinn' })
        .expect(201);
      await as('quinn', undefined, 'quinn@example.test')
        .post('/api/v1/invitations/accept', { token: created.body.data.acceptToken })
        .expect(410);
    });
  });
});
