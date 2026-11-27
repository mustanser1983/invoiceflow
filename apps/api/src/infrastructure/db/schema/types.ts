import { customType } from 'drizzle-orm/pg-core';

/** Case-insensitive text (requires the citext extension, enabled in 0000_init). */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});
