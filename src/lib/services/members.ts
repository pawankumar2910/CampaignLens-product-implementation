import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assertCan, ForbiddenError, NotFoundError, ValidationError, type Actor } from '../auth/permissions';
import { getDb } from '../db/client';
import { agencies, invitations, memberships, user, type Role } from '../db/schema';
import { isUuid, parseInput } from './clients';
import { hashToken, newToken } from './reports';

const role = z.enum(['owner', 'analyst', 'viewer']);
const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200), role });
const agencySchema = z.object({ name: z.string().trim().min(1, 'Enter an agency name.').max(80, 'Agency name must be 80 characters or fewer.') });
const INVITE_TTL_DAYS = 7;

export interface Member {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: Date;
}

/** Every agency a user belongs to. Used to resolve the active agency for a session. */
export async function listMembershipsForUser(userId: string): Promise<Array<{ agencyId: string; agencyName: string; role: Role; isDemo: boolean }>> {
  const db = await getDb();
  return db
    .select({ agencyId: agencies.id, agencyName: agencies.name, role: memberships.role, isDemo: agencies.isDemo })
    .from(memberships)
    .innerJoin(agencies, eq(agencies.id, memberships.agencyId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt));
}

/** A signed-in user with no agency creates one and becomes its owner. */
export async function createAgency(userId: string, input: unknown): Promise<{ agencyId: string }> {
  const data = parseInput(agencySchema, input);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [agency] = await tx.insert(agencies).values({ name: data.name }).returning();
    await tx.insert(memberships).values({ agencyId: agency!.id, userId, role: 'owner' });
    return { agencyId: agency!.id };
  });
}

export async function listMembers(actor: Actor): Promise<Member[]> {
  assertCan(actor, 'workspace:view');
  const db = await getDb();
  return db
    .select({ membershipId: memberships.id, userId: user.id, name: user.name, email: user.email, role: memberships.role, joinedAt: memberships.createdAt })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(eq(memberships.agencyId, actor.agencyId))
    .orderBy(asc(memberships.createdAt));
}

async function ownerCount(agencyId: string): Promise<number> {
  const db = await getDb();
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.agencyId, agencyId), eq(memberships.role, 'owner')));
  return n;
}

async function requireMembership(actor: Actor, membershipId: string) {
  if (!isUuid(membershipId)) throw new NotFoundError('Member not found.');
  const db = await getDb();
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.agencyId, actor.agencyId)))
    .limit(1);
  if (!m) throw new NotFoundError('Member not found.');
  return m;
}

export async function updateMemberRole(actor: Actor, membershipId: string, nextRole: unknown): Promise<void> {
  assertCan(actor, 'member:manage');
  const parsed = parseInput(role, nextRole);
  const m = await requireMembership(actor, membershipId);
  if (m.role === 'owner' && parsed !== 'owner' && (await ownerCount(actor.agencyId)) <= 1) {
    throw new ValidationError('An agency needs at least one owner. Make someone else an owner first.');
  }
  const db = await getDb();
  await db.update(memberships).set({ role: parsed }).where(and(eq(memberships.id, m.id), eq(memberships.agencyId, actor.agencyId)));
}

export async function removeMember(actor: Actor, membershipId: string): Promise<void> {
  assertCan(actor, 'member:manage');
  const m = await requireMembership(actor, membershipId);
  if (m.role === 'owner' && (await ownerCount(actor.agencyId)) <= 1) {
    throw new ValidationError('You cannot remove the only owner. Make someone else an owner first.');
  }
  const db = await getDb();
  await db.delete(memberships).where(and(eq(memberships.id, m.id), eq(memberships.agencyId, actor.agencyId)));
}

export async function listInvitations(actor: Actor) {
  assertCan(actor, 'member:manage');
  const db = await getDb();
  return db
    .select({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt })
    .from(invitations)
    .where(and(eq(invitations.agencyId, actor.agencyId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .orderBy(desc(invitations.createdAt));
}

/**
 * Creates an invite link for a specific email address. There is no email
 * service in this project, so the owner copies the link and sends it themselves.
 */
export async function createInvitation(actor: Actor, input: unknown, now: Date = new Date()): Promise<{ token: string; email: string; role: Role }> {
  assertCan(actor, 'member:manage');
  if (actor.isDemo) throw new ForbiddenError('Inviting people is turned off in the demo sandbox.');
  const data = parseInput(inviteSchema, input);
  const db = await getDb();
  const [already] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.agencyId, actor.agencyId), sql`lower(${user.email}) = ${data.email}`))
    .limit(1);
  if (already) throw new ValidationError(`${data.email} is already a member of this agency.`);
  const token = newToken();
  await db.insert(invitations).values({
    agencyId: actor.agencyId,
    email: data.email,
    role: data.role,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000),
    createdBy: actor.userId,
  });
  return { token, email: data.email, role: data.role };
}

export async function revokeInvitation(actor: Actor, invitationId: string, now: Date = new Date()): Promise<void> {
  assertCan(actor, 'member:manage');
  if (!isUuid(invitationId)) throw new NotFoundError('Invitation not found.');
  const db = await getDb();
  const updated = await db
    .update(invitations)
    .set({ revokedAt: now })
    .where(and(eq(invitations.id, invitationId), eq(invitations.agencyId, actor.agencyId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .returning({ id: invitations.id });
  if (!updated.length) throw new NotFoundError('Invitation not found.');
}

export interface InvitationPreview {
  agencyName: string;
  email: string;
  role: Role;
}

async function findOpenInvitation(token: string, now: Date) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const db = await getDb();
  const [row] = await db
    .select({ invitation: invitations, agencyName: agencies.name })
    .from(invitations)
    .innerJoin(agencies, eq(agencies.id, invitations.agencyId))
    .where(eq(invitations.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || row.invitation.acceptedAt || row.invitation.revokedAt || row.invitation.expiresAt.getTime() <= now.getTime()) return null;
  return row;
}

export async function previewInvitation(token: string, now: Date = new Date()): Promise<InvitationPreview | null> {
  const row = await findOpenInvitation(token, now);
  return row ? { agencyName: row.agencyName, email: row.invitation.email, role: row.invitation.role } : null;
}

/** The invite only works for the account whose email it was issued to. */
export async function acceptInvitation(account: { userId: string; email: string }, token: string, now: Date = new Date()): Promise<{ agencyId: string }> {
  const row = await findOpenInvitation(token, now);
  if (!row) throw new NotFoundError('This invitation is invalid, expired or already used.');
  if (row.invitation.email.toLowerCase() !== account.email.toLowerCase()) {
    throw new ForbiddenError(`This invitation was sent to ${row.invitation.email}. Sign in with that email address to accept it.`);
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(memberships)
      .values({ agencyId: row.invitation.agencyId, userId: account.userId, role: row.invitation.role })
      .onConflictDoNothing({ target: [memberships.agencyId, memberships.userId] });
    await tx.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, row.invitation.id));
  });
  return { agencyId: row.invitation.agencyId };
}
