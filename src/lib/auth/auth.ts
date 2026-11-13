import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { nextCookies } from 'better-auth/next-js';
import { getDb } from '../db/client';
import { account, session, user, verification } from '../db/schema';

/**
 * Authentication is handled by Better Auth (email + password, database sessions,
 * signed HTTP-only cookies). Authorization is not: roles and agency scoping live
 * in src/lib/auth/permissions.ts and src/lib/services.
 */
export const MIN_PASSWORD_LENGTH = 10;

function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET must be set to a random value of at least 32 characters in production.');
  }
  // Development only: lets `npm run dev` work before .env.local exists. Never used in production.
  return 'development-only-secret-not-for-production-use';
}

async function createAuth(options: { nextCookies: boolean }) {
  const db = await getDb();
  return betterAuth({
    appName: 'CampaignLens',
    baseURL: process.env.BETTER_AUTH_URL,
    secret: authSecret(),
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH, maxPasswordLength: 128, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    // Better Auth rate-limits its HTTP endpoints in production (sign-in is limited to 3 attempts per 10 seconds).
    // The in-memory store is per server instance; use database storage when running several instances.
    rateLimit: { enabled: process.env.NODE_ENV === 'production' },
    // nextCookies lets server actions set the session cookie; it must be the last plugin.
    plugins: options.nextCookies ? [nextCookies()] : [],
  });
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
const store = globalThis as typeof globalThis & { __campaignlensAuth?: Promise<Auth> };

/** Auth instance for the Next.js app. */
export function getAuth(): Promise<Auth> {
  store.__campaignlensAuth ??= createAuth({ nextCookies: true });
  return store.__campaignlensAuth;
}

/** Auth instance for scripts and tests that run outside a Next.js request. */
export const createScriptAuth = (): Promise<Auth> => createAuth({ nextCookies: false });
