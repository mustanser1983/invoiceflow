import { asc, desc, type AnyColumn, type SQL } from 'drizzle-orm';
import { z } from 'zod';

/** List responses: the envelope interceptor turns this into `{ data: items, meta }`. */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: { page: number; pageSize: number; total: number; totalPages: number },
  ) {}

  static of<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
    return new Paginated(items, {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }
}

/** Query string for list endpoints (ARCHITECTURE_AND_API.md §7). */
export function listQuerySchema<const S extends readonly [string, ...string[]]>(sortable: S) {
  const sortValues = sortable.flatMap((f) => [f, `-${f}`]) as [string, ...string[]];
  return z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
      search: z.string().trim().max(100).optional(),
      status: z.enum(['active', 'inactive', 'all']).default('active'),
      sort: z.enum(sortValues).default(sortable[0]),
    })
    .strict();
}

export type ListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  status: 'active' | 'inactive' | 'all';
  sort: string;
};

/** Turns `-name` into `ORDER BY name DESC` using a whitelist of columns. */
export function orderBy(sort: string, columns: Record<string, AnyColumn>): SQL {
  const descending = sort.startsWith('-');
  const column = columns[descending ? sort.slice(1) : sort];
  if (!column) throw new Error(`Unknown sort field ${sort}`);
  return descending ? desc(column) : asc(column);
}

/** Escapes LIKE wildcards in user input. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
