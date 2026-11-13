import { and, asc, eq } from 'drizzle-orm';
import { addDays, analyze, isValidDate, todayInTimeZone, type Analysis, type AnalysisFilters, type BudgetDef, type CampaignDay, type DateRange } from '../analytics';
import { assertCan, type Actor } from '../auth/permissions';
import { getDb, type Db, type Tx } from '../db/client';
import { budgets, campaignDays, type BudgetRow, type ClientRow } from '../db/schema';
import { requireClient } from './clients';

/**
 * Loads a client's rows and budgets once, then hands them to the pure analytics
 * layer. All figures on every screen come from `analyze`; there is no SQL
 * aggregation that could drift from the tested functions.
 */
export interface ClientData {
  client: ClientRow;
  rows: CampaignDay[];
  budgets: BudgetRow[];
  /** First and last dates with data, or null when nothing has been imported. */
  bounds: DateRange | null;
  channels: string[];
  /** Today in the client's reporting timezone. */
  today: string;
}

export async function loadRows(db: Db | Tx, agencyId: string, clientId: string): Promise<CampaignDay[]> {
  const rows = await db
    .select({
      date: campaignDays.date,
      channel: campaignDays.channel,
      campaign: campaignDays.campaign,
      spendCents: campaignDays.spendCents,
      impressions: campaignDays.impressions,
      clicks: campaignDays.clicks,
      conversions: campaignDays.conversions,
      revenueCents: campaignDays.revenueCents,
    })
    .from(campaignDays)
    .where(and(eq(campaignDays.clientId, clientId), eq(campaignDays.agencyId, agencyId)))
    .orderBy(asc(campaignDays.date), asc(campaignDays.channel), asc(campaignDays.campaign));
  // Drivers return bigint/numeric columns as strings; convert once at the boundary.
  return rows.map((r) => ({
    date: r.date,
    channel: r.channel,
    campaign: r.campaign,
    spendCents: Number(r.spendCents),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
    revenueCents: Number(r.revenueCents),
  }));
}

export async function loadClientData(actor: Actor, clientId: string, now: Date = new Date()): Promise<ClientData> {
  assertCan(actor, 'workspace:view');
  const db = await getDb();
  const client = await requireClient(db, actor, clientId);
  const rows = await loadRows(db, actor.agencyId, client.id);
  const budgetRows = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.clientId, client.id), eq(budgets.agencyId, actor.agencyId)))
    .orderBy(asc(budgets.periodStart), asc(budgets.scope));
  const bounds = rows.length ? { from: rows[0]!.date, to: rows.at(-1)!.date } : null;
  return {
    client,
    rows,
    budgets: budgetRows.map((b) => ({ ...b, amountCents: Number(b.amountCents) })),
    bounds,
    channels: [...new Set(rows.map((r) => r.channel))].sort(),
    today: todayInTimeZone(client.timezone, now),
  };
}

export const DEFAULT_RANGE_DAYS = 30;

/** Selected range from URL parameters, defaulting to the last 30 days that have data. */
export function resolveRange(data: Pick<ClientData, 'bounds' | 'today'>, params: { from?: string; to?: string }): DateRange {
  const end = data.bounds?.to ?? data.today;
  const fallback = { from: addDays(end, -(DEFAULT_RANGE_DAYS - 1)), to: end };
  const { from, to } = params;
  if (!from || !to || !isValidDate(from) || !isValidDate(to) || from > to) return fallback;
  // Keep analysis bounded: at most two years in one view.
  if (addDays(from, 731) < to) return fallback;
  return { from, to };
}

export const toBudgetDef = (b: BudgetRow): BudgetDef => ({
  id: b.id,
  scope: b.scope,
  channel: b.channel,
  campaign: b.campaign,
  period: { from: b.periodStart, to: b.periodEnd },
  amountCents: b.amountCents,
});

/** Pacing counts spend through the last date that has data, never past the selected end date. */
export function pacingAsOf(data: Pick<ClientData, 'bounds'>, rangeEnd: string): string {
  const last = data.bounds?.to;
  return last && last < rangeEnd ? last : rangeEnd;
}

export function analyzeClient(data: ClientData, range: DateRange, filters: AnalysisFilters = {}): Analysis {
  const overlapping = data.budgets.filter((b) => b.periodStart <= range.to && b.periodEnd >= range.from);
  return analyze({
    rows: data.rows,
    range,
    filters,
    currency: data.client.currency,
    thresholds: data.client.thresholds,
    budgets: overlapping.map(toBudgetDef),
    asOf: pacingAsOf(data, range.to),
  });
}
