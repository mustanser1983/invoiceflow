export interface Env {
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  PORT: number;
  DATABASE_URL: string | undefined;
}

const NODE_ENVS: ReadonlyArray<Env['NODE_ENV']> = ['development', 'test', 'staging', 'production'];

/** Reads and validates environment variables. Throws on invalid values. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const nodeEnv = (source.NODE_ENV ?? 'development') as Env['NODE_ENV'];
  if (!NODE_ENVS.includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
  }

  const port = Number(source.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const databaseUrl = source.DATABASE_URL?.trim() || undefined;
  if (!databaseUrl && (nodeEnv === 'staging' || nodeEnv === 'production')) {
    throw new Error('DATABASE_URL is required in staging and production');
  }

  return { NODE_ENV: nodeEnv, PORT: port, DATABASE_URL: databaseUrl };
}
