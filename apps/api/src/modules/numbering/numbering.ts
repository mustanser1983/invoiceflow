import { InternalServerErrorException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { DocumentType } from '../../infrastructure/db/schema/index.js';
import type { Tx } from '../../infrastructure/db/transaction-manager.js';
import { formatDocumentNumber } from '../tenants/tenant-defaults.js';

/**
 * Takes the next number for a document type (DATABASE_ERD.md §4.1). The UPDATE row-locks the
 * sequence, so concurrent requests queue rather than share a number, and a rollback returns the
 * number: committed numbers have no gaps.
 */
export async function allocateNumber(
  tx: Tx,
  tenantId: string,
  documentType: DocumentType,
): Promise<string> {
  const { rows } = await tx.execute<{ n: string; prefix: string; padding: number }>(sql`
    UPDATE document_sequences
       SET next_number = next_number + 1
     WHERE tenant_id = ${tenantId} AND document_type = ${documentType}
    RETURNING next_number - 1 AS n, prefix, padding
  `);
  const row = rows[0];
  if (!row) {
    throw new InternalServerErrorException(`No numbering configured for ${documentType}`);
  }
  return formatDocumentNumber(row.prefix, Number(row.n), row.padding);
}

/**
 * For master-data codes, which users may also type themselves: skips numbers already taken by a
 * hand-entered code.
 */
export async function allocateFreeCode(
  tx: Tx,
  tenantId: string,
  documentType: DocumentType,
  isTaken: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = await allocateNumber(tx, tenantId, documentType);
    if (!(await isTaken(code))) return code;
  }
  throw new InternalServerErrorException(`Could not find a free ${documentType} code`);
}
