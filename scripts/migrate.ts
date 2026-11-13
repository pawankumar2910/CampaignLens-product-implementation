/**
 * Applies pending SQL migrations from ./drizzle to the database in DATABASE_URL.
 * Usage: npm run db:migrate
 */
import { loadEnv } from './env';

loadEnv();
const { databaseUrl, migrateDatabase } = await import('../src/lib/db/client');

const target = databaseUrl().replace(/\/\/[^@/]*@/, '//***@');
console.log(`Migrating ${target} ...`);
await migrateDatabase();
console.log('Migrations are up to date.');
process.exit(0);
