/**
 * Seeds a local account with the deterministic demo dataset, so you can sign in
 * and explore without using the public "Explore demo" button.
 *
 * Usage: npm run db:seed
 *   SEED_USER_EMAIL     optional, defaults to owner@campaignlens.test
 *   SEED_USER_PASSWORD  optional; if unset a random password is generated and printed once
 *
 * Safe to run twice: if the account already exists nothing is changed.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loadEnv } from './env';

loadEnv();
const { getDb, migrateDatabase } = await import('../src/lib/db/client');
const { user } = await import('../src/lib/db/schema');
const { createScriptAuth } = await import('../src/lib/auth/auth');
const { createDemoSandbox } = await import('../src/lib/services/demo');
const { agencies } = await import('../src/lib/db/schema');

await migrateDatabase();
const db = await getDb();
const email = (process.env.SEED_USER_EMAIL ?? 'owner@campaignlens.test').toLowerCase();
const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
if (existing) {
  console.log(`Seed account ${email} already exists. Nothing to do.`);
  process.exit(0);
}

const generated = !process.env.SEED_USER_PASSWORD;
const password = process.env.SEED_USER_PASSWORD ?? randomBytes(12).toString('base64url');
const auth = await createScriptAuth();
const created = await auth.api.signUpEmail({ body: { name: 'Seed Owner', email, password } });
const actor = await createDemoSandbox({ userId: created.user.id, userName: 'Seed Owner', email });
// A seeded workspace is a normal agency that happens to contain fictional data: it never expires.
await db.update(agencies).set({ isDemo: false, demoExpiresAt: null, name: 'Juniper & Rye (seeded sample)' }).where(eq(agencies.id, actor.agencyId));

console.log('Seeded 3 fictional clients with 90 days of campaign data.');
console.log(`Sign in with: ${email}`);
if (generated) console.log(`Generated password (shown once): ${password}`);
process.exit(0);
