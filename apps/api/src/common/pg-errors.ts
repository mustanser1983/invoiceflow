/** Postgres error fields, found on the error or (when Drizzle wraps it) on its cause chain. */
function pgFields(err: unknown): { code?: string; constraint?: string } | undefined {
  for (let e: unknown = err, depth = 0; e && depth < 3; depth++) {
    const pg = e as { code?: unknown; constraint?: unknown };
    if (typeof pg.code === 'string' && /^[0-9A-Z]{5}$/.test(pg.code)) {
      return {
        code: pg.code,
        constraint: typeof pg.constraint === 'string' ? pg.constraint : undefined,
      };
    }
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export function pgErrorCode(err: unknown): string | undefined {
  return pgFields(err)?.code;
}

export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const f = pgFields(err);
  return f?.code === '23505' && f.constraint === constraint;
}

export function isCheckViolation(err: unknown, constraint: string): boolean {
  const f = pgFields(err);
  return f?.code === '23514' && f.constraint === constraint;
}
