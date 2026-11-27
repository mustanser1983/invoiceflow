import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies defaults in development', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: undefined,
      FIREBASE_PROJECT_ID: undefined,
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow('PORT');
    expect(() => loadEnv({ PORT: '70000' })).toThrow('PORT');
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'prod' })).toThrow('NODE_ENV');
  });

  it('requires DATABASE_URL and FIREBASE_PROJECT_ID in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow('DATABASE_URL');
    expect(() => loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })).toThrow(
      'FIREBASE_PROJECT_ID',
    );
    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      FIREBASE_PROJECT_ID: 'invoiceflow-prod',
    });
    expect(env.DATABASE_URL).toBe('postgres://x');
    expect(env.FIREBASE_PROJECT_ID).toBe('invoiceflow-prod');
  });
});
