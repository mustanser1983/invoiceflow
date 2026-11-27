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

describeWithDb('Customers, suppliers, items and expense categories (Sprint 3)', () => {
  let app: INestApplication;
  let owner: Pool;
  let tenantA: string;
  let tenantB: string;
  const http = () => request(app.getHttpServer());

  const as = (uid: string, tenant: string) => {
    const withHeaders = (t: request.Test) =>
      t.set('Authorization', token(uid)).set('X-Tenant-Id', tenant);
    return {
      get: (url: string) => withHeaders(http().get(url)),
      post: (url: string, body: object) => withHeaders(http().post(url)).send(body),
      patch: (url: string, body: object) => withHeaders(http().patch(url)).send(body),
    };
  };
  const A = () => as('amira', tenantA);
  const B = () => as('bilal', tenantB);

  async function registerAndCreate(uid: string, legalName: string) {
    await http()
      .post('/api/v1/auth/register')
      .set('Authorization', token(uid))
      .send({ fullName: uid })
      .expect(201);
    const res = await http()
      .post('/api/v1/tenants')
      .set('Authorization', token(uid))
      .send({ legalName })
      .expect(201);
    return res.body.data.id as string;
  }

  /** Adds `uid` to `tenant` with a system role, directly in the database. */
  async function addMember(uid: string, tenant: string, roleCode: string) {
    await http()
      .post('/api/v1/auth/register')
      .set('Authorization', token(uid))
      .send({ fullName: uid })
      .expect(201);
    await owner.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role_id)
       SELECT $1, u.id, r.id FROM users u, roles r
       WHERE u.auth_provider_id = $2 AND r.tenant_id IS NULL AND r.code = $3`,
      [tenant, uid, roleCode],
    );
  }

  beforeAll(async () => {
    owner = ownerPool();
    await migrateTestDb(owner);
    await resetTestDb(owner);
    ({ app } = await createTestApp());
    tenantA = await registerAndCreate('amira', 'Amira Trading LLC');
    tenantB = await registerAndCreate('bilal', 'Bilal Services');
    await addMember('sami', tenantA, 'sales_user');
    await addMember('priya', tenantA, 'purchase_user');
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  describe('customers (S3-1 – S3-5)', () => {
    let acmeId: string;

    it('creates customers with automatic codes and default payment terms', async () => {
      const first = await A()
        .post('/api/v1/customers', {
          name: 'Acme Trading LLC',
          email: 'Accounts@Acme.test',
          phone: '+971 4 555 0101',
          taxRegistrationNumber: '100111222300003',
          address: { line1: 'Warehouse 7', city: 'Dubai', emirate: 'Dubai' },
        })
        .expect(201);
      expect(first.body.data).toMatchObject({
        code: 'CUS-00001',
        name: 'Acme Trading LLC',
        email: 'accounts@acme.test',
        paymentTermsDays: 30,
        status: 'active',
      });
      expect(first.body.data).not.toHaveProperty('tenantId');
      acmeId = first.body.data.id;

      const second = await A()
        .post('/api/v1/customers', { name: 'Blue Lagoon Cafe', paymentTermsDays: 0 })
        .expect(201);
      expect(second.body.data).toMatchObject({ code: 'CUS-00002', paymentTermsDays: 0 });
    });

    it('skips automatic codes that were typed by hand', async () => {
      await A().post('/api/v1/customers', { name: 'Hand Coded', code: 'cus-00003' }).expect(201);
      const next = await A().post('/api/v1/customers', { name: 'Next One' }).expect(201);
      expect(next.body.data.code).toBe('CUS-00004');
    });

    it('rejects a code already used in the same business, but not in another', async () => {
      const dup = await A()
        .post('/api/v1/customers', { name: 'Clash', code: 'CUS-00001' })
        .expect(409);
      expect(dup.body.error.details[0].field).toBe('code');
      await B().post('/api/v1/customers', { name: 'Other Biz', code: 'CUS-00001' }).expect(201);
    });

    it('validates TRN, email and unknown fields', async () => {
      await A()
        .post('/api/v1/customers', { name: 'Bad TRN', taxRegistrationNumber: '123' })
        .expect(400);
      await A().post('/api/v1/customers', { name: 'Bad Email', email: 'nope' }).expect(400);
      await A().post('/api/v1/customers', { name: 'Extra', creditLimit: 5 }).expect(400);
    });

    it('lists with pagination metadata, search and sorting', async () => {
      const page = await A().get('/api/v1/customers?pageSize=2&sort=-name').expect(200);
      expect(page.body.meta).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
      expect(page.body.data.map((c: { name: string }) => c.name)).toEqual([
        'Next One',
        'Hand Coded',
      ]);

      for (const term of ['acme', '555 0101', 'accounts@', '1001112223']) {
        const res = await A()
          .get(`/api/v1/customers?search=${encodeURIComponent(term)}`)
          .expect(200);
        expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([acmeId]);
      }
      // LIKE wildcards in the search term are treated literally.
      const wild = await A().get('/api/v1/customers?search=%25').expect(200);
      expect(wild.body.data).toEqual([]);
    });

    it('flags possible duplicates by name, email or TRN', async () => {
      const res = await A()
        .get('/api/v1/customers/duplicates?name=acme%20trading%20llc&email=accounts@acme.test')
        .expect(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({ id: acmeId, matchedOn: ['name', 'email'] }),
      ]);
      const excluded = await A()
        .get(`/api/v1/customers/duplicates?name=Acme%20Trading%20LLC&excludeId=${acmeId}`)
        .expect(200);
      expect(excluded.body.data).toEqual([]);
    });

    it('deactivates instead of deleting, and hides inactive customers by default', async () => {
      const res = await A()
        .patch(`/api/v1/customers/${acmeId}`, { status: 'inactive' })
        .expect(200);
      expect(res.body.data.status).toBe('inactive');
      const active = await A().get('/api/v1/customers').expect(200);
      expect(active.body.data.map((c: { id: string }) => c.id)).not.toContain(acmeId);
      const inactive = await A().get('/api/v1/customers?status=inactive').expect(200);
      expect(inactive.body.data.map((c: { id: string }) => c.id)).toEqual([acmeId]);

      const { rows } = await owner.query(
        `SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY created_at`,
        [acmeId],
      );
      expect(rows.map((r) => r.action)).toEqual(['customer.created', 'customer.deactivated']);
    });

    it('keeps each business’s customers private (XC-2)', async () => {
      await B().get(`/api/v1/customers/${acmeId}`).expect(404);
      await B().patch(`/api/v1/customers/${acmeId}`, { name: 'Stolen' }).expect(404);
      const list = await B().get('/api/v1/customers?status=all').expect(200);
      expect(list.body.data.map((c: { name: string }) => c.name)).toEqual(['Other Biz']);
      const { rows } = await owner.query(`SELECT name FROM customers WHERE id = $1`, [acmeId]);
      expect(rows[0].name).toBe('Acme Trading LLC');
    });

    it('rejects a malformed id', async () => {
      await A().get('/api/v1/customers/not-an-id').expect(400);
    });
  });

  describe('suppliers (S3-6) and role permissions', () => {
    it('creates suppliers with their own numbering', async () => {
      const res = await A()
        .post('/api/v1/suppliers', { name: 'Gulf Paper Supplies', paymentTermsDays: 45 })
        .expect(201);
      expect(res.body.data).toMatchObject({ code: 'SUP-00001', paymentTermsDays: 45 });
    });

    it('lets a Sales User manage customers but not suppliers', async () => {
      await as('sami', tenantA).post('/api/v1/customers', { name: 'Sami Lead' }).expect(201);
      const res = await as('sami', tenantA)
        .post('/api/v1/suppliers', { name: 'Not allowed' })
        .expect(403);
      expect(res.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('lets a Purchase User manage suppliers but not customers', async () => {
      await as('priya', tenantA).post('/api/v1/suppliers', { name: 'Priya Vendor' }).expect(201);
      await as('priya', tenantA).post('/api/v1/customers', { name: 'Not allowed' }).expect(403);
    });
  });

  describe('products and services (S3-7)', () => {
    let srId: string;
    let itemId: string;

    beforeAll(async () => {
      const codes = await A().get('/api/v1/tax/codes').expect(200);
      srId = codes.body.data.find((c: { code: string }) => c.code === 'SR').id;
    });

    it('creates an item with an automatic code and money as decimal strings', async () => {
      const res = await A()
        .post('/api/v1/items', {
          name: 'Consulting hour',
          itemType: 'service',
          sellingPrice: '450.5',
          defaultTaxCodeId: srId,
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        code: 'ITM-00001',
        unit: 'hour',
        sellingPrice: '450.5000',
        purchaseCost: null,
        defaultTaxCodeId: srId,
      });
      itemId = res.body.data.id;
    });

    it('rejects bad amounts', async () => {
      for (const sellingPrice of ['-1', '1.23456', 'abc', '1e3']) {
        await A()
          .post('/api/v1/items', { name: 'Bad', itemType: 'product', sellingPrice })
          .expect(400);
      }
      await A()
        .post('/api/v1/items', { name: 'Number', itemType: 'product', sellingPrice: 10 })
        .expect(400);
    });

    it('rejects another business’s private tax code', async () => {
      const created = await B()
        .post('/api/v1/tax/codes', {
          code: 'BX',
          description: 'B only',
          taxTreatment: 'exempt',
          direction: 'both',
          rate: '0',
          effectiveFrom: '2024-01-01',
        })
        .expect(201);
      const res = await A()
        .post('/api/v1/items', {
          name: 'Sneaky',
          itemType: 'product',
          defaultTaxCodeId: created.body.data.id,
        })
        .expect(400);
      expect(res.body.error.details[0].field).toBe('defaultTaxCodeId');
    });

    it('updates price and filters by type', async () => {
      await A()
        .post('/api/v1/items', { name: 'A4 paper box', itemType: 'product', sellingPrice: '25' })
        .expect(201);
      const res = await A()
        .patch(`/api/v1/items/${itemId}`, { sellingPrice: '500.00' })
        .expect(200);
      expect(res.body.data.sellingPrice).toBe('500.0000');
      const products = await A().get('/api/v1/items?itemType=product').expect(200);
      expect(products.body.data.map((i: { name: string }) => i.name)).toEqual(['A4 paper box']);
    });

    it('keeps items private to their business', async () => {
      await B().get(`/api/v1/items/${itemId}`).expect(404);
    });
  });

  describe('expense categories (S3-8)', () => {
    it('starts every business with the default categories', async () => {
      const res = await A().get('/api/v1/expense-categories').expect(200);
      expect(res.body.data).toHaveLength(13);
      expect(res.body.data.map((c: { name: string }) => c.name)).toEqual(
        expect.arrayContaining(['Rent', 'Fuel', 'Cost of goods']),
      );
    });

    it('adds, rejects duplicates and deactivates', async () => {
      const created = await A()
        .post('/api/v1/expense-categories', { name: 'Software subscriptions' })
        .expect(201);
      expect(created.body.data).toMatchObject({ categoryType: 'operating', isSystem: false });
      await A().post('/api/v1/expense-categories', { name: 'Rent' }).expect(409);

      await A()
        .patch(`/api/v1/expense-categories/${created.body.data.id}`, { status: 'inactive' })
        .expect(200);
      const active = await A().get('/api/v1/expense-categories').expect(200);
      expect(active.body.data).toHaveLength(13);
      const all = await A().get('/api/v1/expense-categories?status=all').expect(200);
      expect(all.body.data).toHaveLength(14);
    });
  });
});
