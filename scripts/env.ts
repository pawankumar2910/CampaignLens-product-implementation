import { existsSync } from 'node:fs';

/** Load .env.local then .env for scripts, the same files Next.js reads. Existing variables win. */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}
