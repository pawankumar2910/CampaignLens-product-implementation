import { ForbiddenError, NotFoundError, ValidationError } from '../auth/permissions';

/** What every server action returns to a form: data, or a message that is safe to show. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Runs a server action body and turns expected domain errors into messages.
 * Anything unexpected (and Next.js redirects) is re-thrown, so real failures
 * reach the error boundary and are never shown as raw text.
 */
export async function run<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError || e instanceof NotFoundError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}
