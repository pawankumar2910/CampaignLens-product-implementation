import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * Database access. One PostgreSQL schema, two ways to run it:
 *
 *   postgres://...        a PostgreSQL server (production, CI, docker compose)
 *   pglite://<dir|memory> PGlite, PostgreSQL compiled to WebAssembly and embedded in the
 *                         Node process. Zero setup for local development and tests.
 *
 * Both are driven through the same Drizzle schema, queries and SQL migrations.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const MIGRATIONS = path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'drizzle');
const store = globalThis as typeof globalThis & { __campaignlensDb?: Promise<Db> };

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production. Set it to a PostgreSQL connection string.');
  }
  return 'pglite://.data/dev';
}

async function connect(): Promise<Db> {
  const url = databaseUrl();
  if (url.startsWith('pglite://')) {
    const target = url.slice('pglite://'.length);
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    let client;
    if (target === 'memory') {
      client = new PGlite();
    } else {
      // The data directory is a runtime setting, not something to bundle.
      const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), target);
      mkdirSync(path.dirname(dir), { recursive: true });
      client = new PGlite(dir);
    }
    const db = drizzle(client, { schema });
    // The embedded database belongs to this process, so it is safe to migrate on connect.
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Db;
  }
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
  // A server database is migrated explicitly with `npm run db:migrate`, never implicitly at runtime.
  return drizzle(pool, { schema }) as unknown as Db;
}

/** Lazily connects once per process (and survives dev hot reloads). */
export function getDb(): Promise<Db> {
  store.__campaignlensDb ??= connect();
  return store.__campaignlensDb;
}

/** Apply pending SQL migrations to a PostgreSQL server. PGlite targets migrate on connect. */
export async function migrateDatabase(): Promise<void> {
  const url = databaseUrl();
  if (url.startsWith('pglite://')) {
    await getDb();
    return;
  }
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const db = await getDb();
  await migrate(db as never, { migrationsFolder: MIGRATIONS });
}

export { schema };
