/** Migrates a PostgreSQL server once before the suite. In-memory PGlite migrates itself per file. */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url.startsWith('pglite://')) return;
  process.env.DATABASE_URL = url;
  const { migrateDatabase } = await import('../src/lib/db/client');
  await migrateDatabase();
}
