import { jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { DbService } from '../src/infrastructure/db/db.service.js';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication;
  const db = { isConfigured: true, ping: jest.fn<() => Promise<number>>() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    db.isConfigured = true;
    db.ping.mockReset();
  });

  it('GET /health returns ok in the standard envelope with a request id', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { status: 'ok' },
      message: 'Request completed',
    });
    expect(res.headers['x-request-id']).toMatch(/^req_/);
  });

  it('GET /health/db returns ok when the database answers', async () => {
    db.ping.mockResolvedValue(4);
    const res = await request(app.getHttpServer()).get('/health/db').expect(200);
    expect(res.body.data).toEqual({ status: 'ok', latencyMs: 4 });
  });

  it('GET /health/db returns 503 when the database is unreachable', async () => {
    db.ping.mockRejectedValue(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/health/db').expect(503);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE' },
    });
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
  });

  it('GET /health/db returns 503 when no database is configured', async () => {
    db.isConfigured = false;
    const res = await request(app.getHttpServer()).get('/health/db').expect(503);
    expect(res.body.error.code).toBe('DATABASE_NOT_CONFIGURED');
  });

  it('unknown routes return the error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(res.body.error.requestId).toMatch(/^req_/);
  });
});
