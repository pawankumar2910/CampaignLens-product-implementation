import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth/auth';

// Better Auth's HTTP endpoints (sign-in, sign-up, sign-out, session). The handler is
// resolved per request because the auth instance connects to the database lazily.
export async function GET(request: Request) {
  return toNextJsHandler(await getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(await getAuth()).POST(request);
}
