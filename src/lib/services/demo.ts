import { and, eq, like, lt, notExists, sql } from 'drizzle-orm';
import { DEFAULT_THRESHOLDS } from '../analytics';
import type { Actor } from '../auth/permissions';
import { getDb } from '../db/client';
import { agencies, budgets, campaignDays, clients, imports, memberships, user } from '../db/schema';
import { buildDemoClients, DEMO_AGENCY_NAME, DEMO_END, DEMO_START } from '../demo/data';
import { createReport, finalizeReport, updateReport } from './reports';

export const DEMO_EMAIL_DOMAIN = 'demo.campaignlens.invalid';
const CHUNK = 500;

export function demoTtlMs(): number {
  const hours = Number(process.env.DEMO_TTL_HOURS ?? 24);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3_600_000;
}

/**
 * Creates a private demo agency for one visitor and fills it with fictional data.
 * Each visitor gets their own copy, so nothing a visitor imports or deletes is
 * visible to anyone else, and demo data never shares an agency with real work.
 */
export async function createDemoSandbox(owner: { userId: string; userName: string; email: string }, now: Date = new Date()): Promise<Actor> {
  const db = await getDb();
  const demoClients = buildDemoClients();

  const { agencyId, firstClientId } = await db.transaction(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({ name: DEMO_AGENCY_NAME, isDemo: true, demoExpiresAt: new Date(now.getTime() + demoTtlMs()) })
      .returning();
    await tx.insert(memberships).values({ agencyId: agency!.id, userId: owner.userId, role: 'owner' });

    let first: string | null = null;
    for (const c of demoClients) {
      const [client] = await tx
        .insert(clients)
        .values({
          agencyId: agency!.id,
          name: c.name,
          currency: c.currency,
          timezone: c.timezone,
          conversionDefinition: c.conversionDefinition,
          branding: { color: c.brandColor, preparedBy: DEMO_AGENCY_NAME, footer: 'Fictional demo data. Not a real company or real results.' },
          thresholds: { ...DEFAULT_THRESHOLDS },
        })
        .returning();
      first ??= client!.id;
      const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const [record] = await tx
        .insert(imports)
        .values({
          agencyId: agency!.id,
          clientId: client!.id,
          fileName: `${slug}-90-days.csv`,
          source: 'Synthetic demo dataset',
          fileHash: `demo-${slug}`,
          mapping: { columns: {}, fixedChannel: null, dateFormat: 'YYYY-MM-DD' },
          conflictPolicy: 'keep',
          rowsInFile: c.rows.length,
          inserted: c.rows.length,
          replaced: 0,
          unchanged: 0,
          keptExisting: 0,
          rejected: 0,
          errorCount: 0,
          warningCount: 0,
          issues: [],
          coverageStart: DEMO_START,
          coverageEnd: DEMO_END,
          currency: c.currency,
          timezone: c.timezone,
          createdBy: owner.userId,
          createdByName: 'Demo setup',
        })
        .returning();
      for (let i = 0; i < c.rows.length; i += CHUNK) {
        await tx.insert(campaignDays).values(
          c.rows.slice(i, i + CHUNK).map((r) => ({ ...r, conversions: r.conversions.toFixed(4), agencyId: agency!.id, clientId: client!.id, importId: record!.id })),
        );
      }
      if (c.budgets.length) {
        await tx.insert(budgets).values(c.budgets.map((b) => ({ ...b, agencyId: agency!.id, clientId: client!.id })));
      }
    }
    return { agencyId: agency!.id, firstClientId: first! };
  });

  const actor: Actor = { userId: owner.userId, userName: owner.userName, email: owner.email, agencyId, agencyName: DEMO_AGENCY_NAME, role: 'owner', isDemo: true };

  // One finished example so the Reports page shows what the end of the workflow looks like.
  const report = await createReport(actor, firstClientId, { title: 'Fernhill Outdoor: October 2026 review', from: '2026-10-01', to: '2026-10-31' }, now);
  await updateReport(actor, firstClientId, report.id, {
    title: report.title,
    commentary:
      'October spend finished about 4% above the agreed budget, inside the tolerance we agreed. Prospecting on Meta carried the largest share of spend; we are reviewing its cost per purchase before the November sale period.\n\nThis commentary was written for the demo and describes fictional results.',
    sections: report.sections,
  });
  await finalizeReport(actor, firstClientId, report.id, now);
  return actor;
}

/** Deletes expired demo agencies (their data cascades) and guest accounts left without an agency. */
export async function cleanupExpiredDemos(now: Date = new Date()): Promise<{ agencies: number; guests: number }> {
  const db = await getDb();
  const removed = await db
    .delete(agencies)
    .where(and(eq(agencies.isDemo, true), lt(agencies.demoExpiresAt, now)))
    .returning({ id: agencies.id });
  const guests = await db
    .delete(user)
    .where(
      and(
        like(user.email, `%@${DEMO_EMAIL_DOMAIN}`),
        notExists(db.select({ one: sql`1` }).from(memberships).where(eq(memberships.userId, user.id))),
      ),
    )
    .returning({ id: user.id });
  return { agencies: removed.length, guests: guests.length };
}
