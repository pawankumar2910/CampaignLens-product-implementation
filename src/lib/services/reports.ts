import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { daysInclusive, formatDateRange, isValidDate } from '../analytics';
import { assertCan, NotFoundError, ValidationError, type Actor } from '../auth/permissions';
import { getDb } from '../db/client';
import { imports, reports, shareLinks, type ReportRow, type ShareLinkRow } from '../db/schema';
import { ALL_SECTION_IDS, DEFAULT_SECTIONS, type ReportSnapshot } from '../reports/snapshot';
import { isUuid, parseInput, requireClient } from './clients';
import { analyzeClient, loadClientData } from './workspace';

const isoDate = (label: string) => z.string().refine(isValidDate, `${label} must be a valid date.`);
const title = z.string().trim().min(1, 'Enter a report title.').max(120, 'Title must be 120 characters or fewer.');

const createSchema = z
  .object({ title: title.optional(), from: isoDate('Start date'), to: isoDate('End date') })
  .refine((r) => r.from <= r.to, 'The end date must be on or after the start date.')
  .refine((r) => daysInclusive(r.from, r.to) <= 366, 'A report can cover at most 366 days.');

const updateSchema = z.object({
  title,
  commentary: z.string().max(5000, 'Commentary must be 5,000 characters or fewer.'),
  sections: z.array(z.enum(ALL_SECTION_IDS as [string, ...string[]])).min(1, 'Include at least one section.'),
});

const shareSchema = z.object({ expiresInDays: z.number().int().min(1, 'Choose an expiry of at least 1 day.').max(90, 'Share links can last at most 90 days.') });

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const newToken = (): string => randomBytes(24).toString('base64url');

/** Capture everything the report will show, from the same analytics the workspace uses. */
async function buildSnapshot(actor: Actor, clientId: string, range: { from: string; to: string }, now: Date): Promise<ReportSnapshot> {
  const data = await loadClientData(actor, clientId, now);
  const analysis = analyzeClient(data, range);
  const db = await getDb();
  const importRows = await db
    .select()
    .from(imports)
    .where(and(eq(imports.clientId, data.client.id), eq(imports.agencyId, actor.agencyId)))
    .orderBy(desc(imports.createdAt));
  const contributing = importRows.filter((i) => i.coverageStart && i.coverageEnd && i.coverageStart <= range.to && i.coverageEnd >= range.from);
  return {
    version: 1,
    generatedAt: now.toISOString(),
    agencyName: actor.agencyName,
    client: {
      name: data.client.name,
      currency: data.client.currency,
      timezone: data.client.timezone,
      conversionDefinition: data.client.conversionDefinition,
      branding: data.client.branding,
    },
    analysis,
    thresholds: data.client.thresholds,
    provenance: {
      imports: contributing.slice(0, 20).map((i) => ({
        fileName: i.fileName,
        source: i.source,
        importedAt: i.createdAt.toISOString(),
        importedBy: i.createdByName,
        coverageStart: i.coverageStart,
        coverageEnd: i.coverageEnd,
      })),
      rowCount: analysis.current.rows,
      dataThrough: data.bounds?.to ?? null,
    },
  };
}

async function requireReport(actor: Actor, clientId: string, reportId: string): Promise<ReportRow> {
  if (!isUuid(reportId)) throw new NotFoundError('Report not found.');
  const db = await getDb();
  const client = await requireClient(db, actor, clientId);
  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.clientId, client.id), eq(reports.agencyId, actor.agencyId)))
    .limit(1);
  if (!row) throw new NotFoundError('Report not found.');
  return row;
}

export async function listReports(actor: Actor, clientId: string): Promise<Array<Omit<ReportRow, 'snapshot'>>> {
  assertCan(actor, 'workspace:view');
  const db = await getDb();
  const client = await requireClient(db, actor, clientId);
  return db
    .select({
      id: reports.id,
      agencyId: reports.agencyId,
      clientId: reports.clientId,
      title: reports.title,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      status: reports.status,
      commentary: reports.commentary,
      sections: reports.sections,
      createdBy: reports.createdBy,
      createdAt: reports.createdAt,
      updatedAt: reports.updatedAt,
      finalizedAt: reports.finalizedAt,
    })
    .from(reports)
    .where(and(eq(reports.clientId, client.id), eq(reports.agencyId, actor.agencyId)))
    .orderBy(desc(reports.createdAt));
}

export async function getReport(actor: Actor, clientId: string, reportId: string): Promise<ReportRow> {
  assertCan(actor, 'workspace:view');
  return requireReport(actor, clientId, reportId);
}

export async function createReport(actor: Actor, clientId: string, input: unknown, now: Date = new Date()): Promise<ReportRow> {
  assertCan(actor, 'report:write');
  const data = parseInput(createSchema, input);
  const snapshot = await buildSnapshot(actor, clientId, { from: data.from, to: data.to }, now);
  const db = await getDb();
  const [row] = await db
    .insert(reports)
    .values({
      agencyId: actor.agencyId,
      clientId,
      title: data.title ?? `${snapshot.client.name}: ${formatDateRange(data.from, data.to)}`,
      periodStart: data.from,
      periodEnd: data.to,
      sections: [...DEFAULT_SECTIONS],
      snapshot,
      createdBy: actor.userId,
    })
    .returning();
  return row!;
}

function assertDraft(report: ReportRow): void {
  if (report.status !== 'draft') throw new ValidationError('This report is finalized and can no longer be edited. Duplicate it to make changes.');
}

export async function updateReport(actor: Actor, clientId: string, reportId: string, input: unknown): Promise<ReportRow> {
  assertCan(actor, 'report:write');
  const data = parseInput(updateSchema, input);
  const report = await requireReport(actor, clientId, reportId);
  assertDraft(report);
  const db = await getDb();
  const [row] = await db
    .update(reports)
    .set({ title: data.title, commentary: data.commentary, sections: data.sections })
    .where(and(eq(reports.id, report.id), eq(reports.agencyId, actor.agencyId)))
    .returning();
  return row!;
}

/** Re-capture the data for a draft, e.g. after a new import. Finalized reports never change. */
export async function refreshReportSnapshot(actor: Actor, clientId: string, reportId: string, now: Date = new Date()): Promise<ReportRow> {
  assertCan(actor, 'report:write');
  const report = await requireReport(actor, clientId, reportId);
  assertDraft(report);
  const snapshot = await buildSnapshot(actor, clientId, { from: report.periodStart, to: report.periodEnd }, now);
  const db = await getDb();
  const [row] = await db.update(reports).set({ snapshot }).where(and(eq(reports.id, report.id), eq(reports.agencyId, actor.agencyId))).returning();
  return row!;
}

export async function finalizeReport(actor: Actor, clientId: string, reportId: string, now: Date = new Date()): Promise<ReportRow> {
  assertCan(actor, 'report:write');
  const report = await requireReport(actor, clientId, reportId);
  assertDraft(report);
  const db = await getDb();
  const [row] = await db
    .update(reports)
    .set({ status: 'final', finalizedAt: now })
    .where(and(eq(reports.id, report.id), eq(reports.agencyId, actor.agencyId)))
    .returning();
  return row!;
}

/** A new draft with the same period, commentary and sections, and freshly captured data. */
export async function duplicateReport(actor: Actor, clientId: string, reportId: string, now: Date = new Date()): Promise<ReportRow> {
  assertCan(actor, 'report:write');
  const source = await requireReport(actor, clientId, reportId);
  const snapshot = await buildSnapshot(actor, clientId, { from: source.periodStart, to: source.periodEnd }, now);
  const db = await getDb();
  const [row] = await db
    .insert(reports)
    .values({
      agencyId: actor.agencyId,
      clientId: source.clientId,
      title: `${source.title} (copy)`.slice(0, 120),
      periodStart: source.periodStart,
      periodEnd: source.periodEnd,
      commentary: source.commentary,
      sections: source.sections,
      snapshot,
      createdBy: actor.userId,
    })
    .returning();
  return row!;
}

/** Deleting a report also deletes its share links (cascade), so shared URLs stop working. */
export async function deleteReport(actor: Actor, clientId: string, reportId: string): Promise<void> {
  assertCan(actor, 'report:delete');
  const report = await requireReport(actor, clientId, reportId);
  const db = await getDb();
  await db.delete(reports).where(and(eq(reports.id, report.id), eq(reports.agencyId, actor.agencyId)));
}

/* ----------------------------- Share links ------------------------------ */

export type ShareLinkState = 'active' | 'expired' | 'revoked';
export const shareLinkState = (link: Pick<ShareLinkRow, 'expiresAt' | 'revokedAt'>, now: Date = new Date()): ShareLinkState =>
  link.revokedAt ? 'revoked' : link.expiresAt.getTime() <= now.getTime() ? 'expired' : 'active';

export async function listShareLinks(actor: Actor, clientId: string, reportId: string): Promise<ShareLinkRow[]> {
  assertCan(actor, 'workspace:view');
  const report = await requireReport(actor, clientId, reportId);
  const db = await getDb();
  return db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.reportId, report.id), eq(shareLinks.agencyId, actor.agencyId)))
    .orderBy(desc(shareLinks.createdAt));
}

/**
 * Creates a read-only link to one finalized report. The token is returned once;
 * only its SHA-256 hash is stored, so a database leak does not expose live links.
 */
export async function createShareLink(actor: Actor, clientId: string, reportId: string, input: unknown, now: Date = new Date()): Promise<{ link: ShareLinkRow; token: string }> {
  assertCan(actor, 'share:write');
  const data = parseInput(shareSchema, input);
  const report = await requireReport(actor, clientId, reportId);
  if (report.status !== 'final') throw new ValidationError('Finalize the report before sharing it, so the client sees a fixed version.');
  const token = newToken();
  const db = await getDb();
  const [link] = await db
    .insert(shareLinks)
    .values({
      agencyId: actor.agencyId,
      reportId: report.id,
      tokenHash: hashToken(token),
      createdBy: actor.userId,
      createdByName: actor.userName,
      expiresAt: new Date(now.getTime() + data.expiresInDays * 86_400_000),
    })
    .returning();
  return { link: link!, token };
}

export async function revokeShareLink(actor: Actor, clientId: string, reportId: string, linkId: string, now: Date = new Date()): Promise<void> {
  assertCan(actor, 'share:write');
  if (!isUuid(linkId)) throw new NotFoundError('Share link not found.');
  const report = await requireReport(actor, clientId, reportId);
  const db = await getDb();
  const updated = await db
    .update(shareLinks)
    .set({ revokedAt: now })
    .where(and(eq(shareLinks.id, linkId), eq(shareLinks.reportId, report.id), eq(shareLinks.agencyId, actor.agencyId), isNull(shareLinks.revokedAt)))
    .returning({ id: shareLinks.id });
  if (!updated.length) throw new NotFoundError('Share link not found or already revoked.');
}

export interface SharedReport {
  title: string;
  commentary: string;
  sections: string[];
  snapshot: ReportSnapshot;
  finalizedAt: string | null;
  expiresAt: string;
}

/**
 * Public lookup by share token. No actor: the token is the only credential.
 * Unknown, expired and revoked tokens are indistinguishable to the caller, and
 * the result carries the report snapshot only: no ids, no workspace data.
 */
export async function resolveSharedReport(token: string, now: Date = new Date()): Promise<SharedReport | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const db = await getDb();
  const [row] = await db
    .select({ link: shareLinks, report: reports })
    .from(shareLinks)
    .innerJoin(reports, eq(reports.id, shareLinks.reportId))
    .where(eq(shareLinks.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || shareLinkState(row.link, now) !== 'active' || row.report.status !== 'final') return null;
  return {
    title: row.report.title,
    commentary: row.report.commentary,
    sections: row.report.sections,
    snapshot: row.report.snapshot,
    finalizedAt: row.report.finalizedAt?.toISOString() ?? null,
    expiresAt: row.link.expiresAt.toISOString(),
  };
}
