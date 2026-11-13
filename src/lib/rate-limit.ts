/**
 * Small fixed-window rate limiter held in process memory. It protects the few
 * unauthenticated entry points this app owns (starting a demo, opening share
 * links). With several server instances each one keeps its own counters, which
 * loosens the limit but never blocks legitimate use.
 */
interface Window {
  count: number;
  resetAt: number;
}

const store = globalThis as typeof globalThis & { __campaignlensRate?: Map<string, Window> };
const windows = (store.__campaignlensRate ??= new Map<string, Window>());

export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  if (windows.size > 5000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  return { allowed: current.count <= limit, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
}

export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'local';
}
