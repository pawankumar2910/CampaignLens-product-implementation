'use server';

import { randomBytes, randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuth } from '../auth/auth';
import { AGENCY_COOKIE, getActor, getSessionUser, requireActor } from '../auth/session';
import { clientIp, rateLimit } from '../rate-limit';
import { listClients } from '../services/clients';
import { cleanupExpiredDemos, createDemoSandbox, DEMO_EMAIL_DOMAIN } from '../services/demo';
import { acceptInvitation, createAgency, createInvitation, listMembershipsForUser, removeMember, revokeInvitation, updateMemberRole } from '../services/members';
import { run, type ActionResult } from './result';

async function rememberAgency(agencyId: string): Promise<void> {
  (await cookies()).set(AGENCY_COOKIE, agencyId, { httpOnly: true, sameSite: 'lax', secure: (process.env.BETTER_AUTH_URL ?? '').startsWith('https://'), path: '/', maxAge: 60 * 60 * 24 * 30 });
}

/**
 * "Explore demo": creates a throwaway guest account and a private sandbox agency
 * filled with fictional data, signs the visitor in, and opens the first client.
 */
export async function startDemo(): Promise<ActionResult> {
  const requestHeaders = await headers();
  const limit = rateLimit(`demo:${clientIp(requestHeaders)}`, 8, 10 * 60_000);
  if (!limit.allowed) return { ok: false, error: `Too many demo sandboxes were started from this network. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).` };

  await cleanupExpiredDemos();
  const auth = await getAuth();
  const email = `guest-${randomUUID()}@${DEMO_EMAIL_DOMAIN}`;
  // The guest never needs this password: the sandbox lives only as long as the session cookie.
  const created = await auth.api.signUpEmail({ body: { name: 'Demo visitor', email, password: randomBytes(24).toString('base64url') }, headers: requestHeaders });
  const actor = await createDemoSandbox({ userId: created.user.id, userName: 'Demo visitor', email });
  await rememberAgency(actor.agencyId);
  const clients = await listClients(actor);
  const first = clients.find((c) => c.name === 'Fernhill Outdoor') ?? clients[0];
  redirect(first ? `/c/${first.id}` : '/clients');
}

export async function createAgencyAction(name: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');
  const existing = await listMembershipsForUser(user.id);
  if (existing.length) redirect('/clients');
  const result = await run(() => createAgency(user.id, { name }));
  if (!result.ok) return result;
  await rememberAgency(result.data.agencyId);
  redirect('/clients');
}

export async function switchAgencyAction(agencyId: string): Promise<void> {
  const resolved = await getActor();
  if (!resolved) redirect('/sign-in');
  const memberships = await listMembershipsForUser(resolved.user.id);
  if (memberships.some((m) => m.agencyId === agencyId)) await rememberAgency(agencyId);
  redirect('/clients');
}

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  const result = await run(() => acceptInvitation({ userId: user.id, email: user.email }, token));
  if (!result.ok) return result;
  await rememberAgency(result.data.agencyId);
  redirect('/clients');
}

export async function createInvitationAction(input: { email: string; role: string }): Promise<ActionResult<{ token: string; email: string }>> {
  const actor = await requireActor();
  const result = await run(() => createInvitation(actor, input));
  revalidatePath('/team');
  return result.ok ? { ok: true, data: { token: result.data.token, email: result.data.email } } : result;
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => revokeInvitation(actor, invitationId));
  revalidatePath('/team');
  return result.ok ? { ok: true, data: undefined } : result;
}

export async function updateMemberRoleAction(membershipId: string, role: string): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => updateMemberRole(actor, membershipId, role));
  revalidatePath('/team');
  return result.ok ? { ok: true, data: undefined } : result;
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => removeMember(actor, membershipId));
  revalidatePath('/team');
  return result.ok ? { ok: true, data: undefined } : result;
}
