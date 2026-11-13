import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { listMembershipsForUser } from '../services/members';
import { getAuth } from './auth';
import type { Actor } from './permissions';

export const AGENCY_COOKIE = 'cl_agency';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** The signed-in user for this request, validated against the session table. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
});

/**
 * Resolves who is acting and in which agency. The agency cookie is only a
 * preference: it is honoured only if the user really is a member of that agency.
 */
export const getActor = cache(async (): Promise<{ user: SessionUser; actor: Actor | null } | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const memberships = await listMembershipsForUser(user.id);
  const preferred = (await cookies()).get(AGENCY_COOKIE)?.value;
  const active = memberships.find((m) => m.agencyId === preferred) ?? memberships[0];
  if (!active) return { user, actor: null };
  return {
    user,
    actor: { userId: user.id, userName: user.name, email: user.email, agencyId: active.agencyId, agencyName: active.agencyName, role: active.role, isDemo: active.isDemo },
  };
});

/** For pages and actions inside the app: a valid session and an agency, or a redirect. */
export async function requireActor(): Promise<Actor> {
  const resolved = await getActor();
  if (!resolved) redirect('/sign-in');
  if (!resolved.actor) redirect('/onboarding');
  return resolved.actor;
}
