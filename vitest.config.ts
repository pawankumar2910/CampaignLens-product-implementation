import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Integration tests use an in-memory PostgreSQL (PGlite) per test file by default.
 * Set TEST_DATABASE_URL=postgres://... to run the same suite through node-postgres
 * against a PostgreSQL server (CI does this with a service container). The server
 * database is migrated once in tests/global-setup.ts, and files then run one at a time.
 */
const databaseUrl = process.env.TEST_DATABASE_URL ?? 'pglite://memory';
const server = !databaseUrl.startsWith('pglite://');

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { DATABASE_URL: databaseUrl },
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: !server,
  },
});
