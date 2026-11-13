/**
 * Starts the production server for browser tests against a fresh embedded database.
 * Used by Playwright (see playwright.config.ts). Nothing here talks to an external service.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';

const port = process.env.E2E_PORT ?? '3100';
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: 'pglite://.data/e2e',
  BETTER_AUTH_URL: `http://localhost:${port}`,
  // A throwaway secret for this run only.
  BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
  NEXT_TELEMETRY_DISABLED: '1',
};

rmSync('.data/e2e', { recursive: true, force: true });
if (!process.env.E2E_SKIP_BUILD) {
  const build = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', env, shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const server = spawn('npx', ['next', 'start', '-p', port], { stdio: 'inherit', env, shell: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill());
server.on('exit', (code) => process.exit(code ?? 0));
