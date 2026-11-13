import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DATE_FORMATS, todayInTimeZone, type CampaignDay } from '../analytics';
import { assertCan, NotFoundError, ValidationError, type Actor } from '../auth/permissions';
import { getDb } from '../db/client';
import { campaignDays, imports, type ImportRow } from '../db/schema';
import { CsvStructureError, MAX_FILE_BYTES, byteLength, parseCsv } from '../import/csv';
import type { ImportMapping } from '../import/mapping';
import { normalizeCsv, type ImportIssue, type NormalizedRecord, type NormalizeResult } from '../import/normalize';
import { planImport, type ConflictPolicy, type ImportPlan } from '../import/plan';
import { isUuid, parseInput, requireClient } from './clients';
import { loadRows } from './workspace';

const MAX_STORED_ISSUES = 200;
const PREVIEW_ROWS = 25;
const CHUNK = 500;

const mappingSchema = z.object({
  columns: z.record(z.string(), z.string().max(200)).refine((c) => Object.keys(c).length <= 12, 'Invalid column mapping.'),
  fixedChannel: z.string().trim().max(120).nullable(),
  dateFormat: z.enum(DATE_FORMATS as [string, ...string[]]),
});

const fileSchema = z.object({
  text: z.string().min(1, 'The file is empty.'),
  fileName: z.string().trim().min(1).max(200),
  mapping: mappingSchema,
});

const commitSchema = fileSchema.extend({
  source: z.string().trim().min(1, 'Describe where this file came from, e.g. "Google Ads campaign report".').max(120),
  conflictPolicy: z.enum(['replace', 'keep']).nullable(),
  /** The user explicitly agreed to import the valid rows and leave the rejected rows out. */
  acceptRejected: z.boolean(),
});

export interface ImportPreview {
  fileName: string;
  fileHash: string;
  rowsInFile: number;
  validRows: number;
  rejectedRows: number;
  errorCount: number;
  warningCount: number;
  /** First 200 issues, errors first within each row. */
  issues: ImportIssue[];
  issuesTruncated: boolean;
  sample: NormalizedRecord[];
  coverage: { from: string; to: string } | null;
  channels: string[];
  plan: { inserts: number; unchanged: number; conflicts: number };
  conflictSample: Array<{ date: string; channel: string; campaign: string; changed: string[]; existingSpendCents: number; incomingSpendCents: number }>;
  /** Set when a file with identical contents was imported before. */
  previousImportOfSameFile: { at: string; by: string } | null;
  currency: string;
  timezone: string;
}

export type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; fatal: string };

const hashText = (text: string): string => createHash('sha256').update(text).digest('hex');

interface Prepared {
  result: NormalizeResult;
  plan: ImportPlan;
  existing: CampaignDay[];
}

function prepare(text: string, mapping: ImportMapping, currency: string, today: string, existing: CampaignDay[]): Prepared {
  if (byteLength(text) > MAX_FILE_BYTES) throw new CsvStructureError('The file is larger than 5 MB. Split the export into smaller date ranges.');
  const result = normalizeCsv(parseCsv(text), mapping, { currency, today });
  return { result, plan: planImport(result.records, existing), existing };
}

/** Validate a file against the client's data without writing anything. */
export async function previewImport(actor: Actor, clientId: string, input: unknown): Promise<PreviewResult> {
  assertCan(actor, 'data:import');
  const data = parseInput(fileSchema, input);
  const db = await getDb();
  const client = await requireClient(db, actor, clientId);
  const existing = await loadRows(db, actor.agencyId, client.id);

  let prepared: Prepared;
  try {
    prepared = prepare(data.text, data.mapping as ImportMapping, client.currency, todayInTimeZone(client.timezone), existing);
  } catch (e) {
    if (e instanceof CsvStructureError) return { ok: false, fatal: e.message };
    throw e;
  }
  const { result, plan } = prepared;
  const fileHash = hashText(data.text);
  const [previous] = await db
    .select({ at: imports.createdAt, by: imports.createdByName })
    .from(imports)
    .where(and(eq(imports.clientId, client.id), eq(imports.agencyId, actor.agencyId), eq(imports.fileHash, fileHash)))
    .orderBy(desc(imports.createdAt))
    .limit(1);

  return {
    ok: true,
    preview: {
      fileName: data.fileName,
      fileHash,
      rowsInFile: result.rowsInFile,
      validRows: result.records.length,
      rejectedRows: result.rejectedRows,
      errorCount: result.issues.filter((i) => i.severity === 'error').length,
      warningCount: result.issues.filter((i) => i.severity === 'warning').length,
      issues: result.issues.slice(0, MAX_STORED_ISSUES),
      issuesTruncated: result.issues.length > MAX_STORED_ISSUES,
      sample: result.records.slice(0, PREVIEW_ROWS),
      coverage: result.coverage,
      channels: result.channels,
      plan: { inserts: plan.inserts.length, unchanged: plan.unchanged.length, conflicts: plan.conflicts.length },
      conflictSample: plan.conflicts.slice(0, 8).map((c) => ({
        date: c.incoming.date,
        channel: c.incoming.channel,
        campaign: c.incoming.campaign,
        changed: c.changed,
        existingSpendCents: c.existing.spendCents,
        incomingSpendCents: c.incoming.spendCents,
      })),
      previousImportOfSameFile: previous ? { at: previous.at.toISOString(), by: previous.by } : null,
      currency: client.currency,
      timezone: client.timezone,
    },
  };
}

const toDbRow = (r: NormalizedRecord, agencyId: string, clientId: string, importId: string) => ({
  agencyId,
  clientId,
  importId,
  date: r.date,
  channel: r.channel,
  campaign: r.campaign,
  spendCents: r.spendCents,
  impressions: r.impressions,
  clicks: r.clicks,
  conversions: r.conversions.toFixed(4),
  revenueCents: r.revenueCents,
});

/**
 * Re-validates the file on the server (the browser preview is never trusted)
 * and writes it in one transaction: the import record plus its rows, or nothing.
 */
export async function commitImport(actor: Actor, clientId: string, input: unknown): Promise<ImportRow> {
  assertCan(actor, 'data:import');
  const data = parseInput(commitSchema, input);
  const db = await getDb();
  const client = await requireClient(db, actor, clientId);

  return db.transaction(async (tx) => {
    const existing = await loadRows(tx, actor.agencyId, client.id);
    let prepared: Prepared;
    try {
      prepared = prepare(data.text, data.mapping as ImportMapping, client.currency, todayInTimeZone(client.timezone), existing);
    } catch (e) {
      if (e instanceof CsvStructureError) throw new ValidationError(e.message);
      throw e;
    }
    const { result, plan } = prepared;
    if (!result.records.length) throw new ValidationError('No valid rows to import. Fix the errors in the file and try again.');
    if (result.rejectedRows > 0 && !data.acceptRejected) {
      throw new ValidationError(`${result.rejectedRows} row(s) have errors. Fix the file, or confirm that you want to import only the valid rows.`);
    }
    if (plan.conflicts.length > 0 && !data.conflictPolicy) {
      throw new ValidationError(`${plan.conflicts.length} row(s) already exist with different values. Choose whether to replace them or keep the existing values.`);
    }
    const policy: ConflictPolicy = data.conflictPolicy ?? 'keep';
    const replaced = policy === 'replace' ? plan.conflicts.length : 0;

    const [record] = await tx
      .insert(imports)
      .values({
        agencyId: actor.agencyId,
        clientId: client.id,
        fileName: data.fileName,
        source: data.source,
        fileHash: hashText(data.text),
        mapping: data.mapping as ImportMapping,
        conflictPolicy: policy,
        rowsInFile: result.rowsInFile,
        inserted: plan.inserts.length,
        replaced,
        unchanged: plan.unchanged.length,
        keptExisting: plan.conflicts.length - replaced,
        rejected: result.rejectedRows,
        errorCount: result.issues.filter((i) => i.severity === 'error').length,
        warningCount: result.issues.filter((i) => i.severity === 'warning').length,
        issues: result.issues.slice(0, MAX_STORED_ISSUES),
        coverageStart: result.coverage?.from ?? null,
        coverageEnd: result.coverage?.to ?? null,
        currency: client.currency,
        timezone: client.timezone,
        createdBy: actor.userId,
        createdByName: actor.userName,
      })
      .returning();
    const importId = record!.id;

    for (let i = 0; i < plan.inserts.length; i += CHUNK) {
      await tx.insert(campaignDays).values(plan.inserts.slice(i, i + CHUNK).map((r) => toDbRow(r, actor.agencyId, client.id, importId)));
    }
    if (policy === 'replace') {
      for (const c of plan.conflicts) {
        const r = c.incoming;
        await tx
          .update(campaignDays)
          .set({ spendCents: r.spendCents, impressions: r.impressions, clicks: r.clicks, conversions: r.conversions.toFixed(4), revenueCents: r.revenueCents, importId })
          .where(
            and(
              eq(campaignDays.agencyId, actor.agencyId),
              eq(campaignDays.clientId, client.id),
              eq(campaignDays.date, r.date),
              eq(campaignDays.channel, r.channel),
              eq(campaignDays.campaign, r.campaign),
            ),
          );
      }
    }
    return record!;
  });
}

export async function listImports(actor: Actor, clientId: string): Promise<ImportRow[]> {
  assertCan(actor, 'workspace:view');
  const db = await getDb();
  const client = await requireClient(db, actor, clientId);
  return db
    .select()
    .from(imports)
    .where(and(eq(imports.clientId, client.id), eq(imports.agencyId, actor.agencyId)))
    .orderBy(desc(imports.createdAt));
}

export async function getImport(actor: Actor, clientId: string, importId: string): Promise<ImportRow> {
  assertCan(actor, 'workspace:view');
  if (!isUuid(importId)) throw new NotFoundError('Import not found.');
  const db = await getDb();
  const client = await requireClient(db, actor, clientId);
  const [row] = await db
    .select()
    .from(imports)
    .where(and(eq(imports.id, importId), eq(imports.clientId, client.id), eq(imports.agencyId, actor.agencyId)))
    .limit(1);
  if (!row) throw new NotFoundError('Import not found.');
  return row;
}
