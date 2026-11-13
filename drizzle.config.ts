import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` diffs this schema against ./drizzle and writes a new SQL migration.
// It does not need a database connection.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
});
