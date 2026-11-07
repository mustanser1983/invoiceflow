import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Migrations use the direct (non-pooled) Neon endpoint and the owner role.
// See docs/adr/0001-orm-drizzle.md.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
