import { compareMetrics, type MetricsComparison } from './compare';
import { computeCoverage, dailySeries, type Coverage, type SeriesPoint } from './coverage';
import { daysInclusive, eachDate, previousPeriod } from './dates';
import { investigate, type BudgetPacing, type InvestigationItem, type Thresholds } from './investigate';
import { summarize, summarizeBy } from './metrics';
import { computePacing } from './pacing';
import { buildSummary, type Summary } from './summary';
import { campaignKey, type CampaignDay, type DateRange, type Metrics } from './types';

/**
 * The single entry point used by the dashboard, the investigation queue and
 * report snapshots. Everything a screen or a report shows is derived here, so
 * a number can never differ between the workspace and the client report.
 */
export interface BudgetDef {
  id: string;
  scope: 'client' | 'campaign';
  channel: string | null;
  campaign: string | null;
  period: DateRange;
  amountCents: number;
}

export interface AnalysisFilters {
  channel?: string | null;
  /** A campaign key from `campaignKey(channel, campaign)`. */
  campaignKey?: string | null;
}

export interface AnalysisInput {
  /** All of the client's rows. Filtering and windowing happen here. */
  rows: readonly CampaignDay[];
  range: DateRange;
  filters?: AnalysisFilters;
  currency: string;
  thresholds: Thresholds;
  budgets: readonly BudgetDef[];
  /** Budget pacing counts spend through this date (normally the last date with data). */
  asOf: string;
}

export interface Breakdown {
  key: string;
  channel: string;
  campaign: string | null;
  current: Metrics;
  previous: Metrics;
  comparison: MetricsComparison;
  /** Share of the filtered total spend, as a fraction. null when total spend is zero. */
  spendShare: number | null;
}

export interface Analysis {
  range: DateRange;
  previousRange: DateRange;
  days: number;
  currency: string;
  current: Metrics;
  previous: Metrics;
  comparison: MetricsComparison;
  /** False when the previous period has no rows at all: comparisons are then hidden. */
  previousHasData: boolean;
  coverage: Coverage;
  previousCoverage: Coverage;
  series: SeriesPoint[];
  previousSeries: SeriesPoint[];
  channels: Breakdown[];
  campaigns: Breakdown[];
  pacing: BudgetPacing[];
  queue: InvestigationItem[];
  summary: Summary;
}

export function budgetLabel(b: Pick<BudgetDef, 'scope' | 'channel' | 'campaign'>): string {
  return b.scope === 'client' ? 'Total client budget' : `${b.channel} / ${b.campaign}`;
}

export function pacingForBudget(rows: readonly CampaignDay[], b: BudgetDef, asOf: string): BudgetPacing | null {
  const scoped = b.scope === 'client' ? rows : rows.filter((r) => r.channel === b.channel && r.campaign === b.campaign);
  const through = asOf < b.period.to ? asOf : b.period.to;
  const inPeriod = scoped.filter((r) => r.date >= b.period.from && r.date <= through);
  const pacing = computePacing({ budgetCents: b.amountCents, period: b.period, asOf, spendCents: summarize(inPeriod).spendCents });
  if (!pacing) return null;
  const datesWithData = new Set(inPeriod.map((r) => r.date));
  const elapsed = pacing.elapsedDays > 0 ? eachDate({ from: b.period.from, to: through }) : [];
  return {
    budgetId: b.id,
    label: budgetLabel(b),
    scope: b.scope,
    channel: b.channel,
    campaign: b.campaign,
    pacing,
    elapsedDaysWithoutData: elapsed.filter((d) => !datesWithData.has(d)).length,
  };
}

function applyFilters(rows: readonly CampaignDay[], filters: AnalysisFilters | undefined): CampaignDay[] {
  const channel = filters?.channel || null;
  const key = filters?.campaignKey || null;
  return rows.filter((r) => (!channel || r.channel === channel) && (!key || campaignKey(r.channel, r.campaign) === key));
}

function breakdown(current: CampaignDay[], previous: CampaignDay[], keyOf: (r: CampaignDay) => string, totalSpend: number, withCampaign: boolean): Breakdown[] {
  const cur = new Map(summarizeBy(current, keyOf).map((g) => [g.key, g.metrics]));
  const prev = new Map(summarizeBy(previous, keyOf).map((g) => [g.key, g.metrics]));
  const sample = new Map<string, CampaignDay>();
  for (const r of [...previous, ...current]) sample.set(keyOf(r), r);
  const empty = summarize([]);
  return [...sample].map(([key, row]) => {
    const c = cur.get(key) ?? empty;
    const p = prev.get(key) ?? empty;
    return {
      key,
      channel: row.channel,
      campaign: withCampaign ? row.campaign : null,
      current: c,
      previous: p,
      comparison: compareMetrics(c, p),
      spendShare: totalSpend > 0 ? c.spendCents / totalSpend : null,
    };
  });
}

export function analyze(input: AnalysisInput): Analysis {
  const { range, currency, thresholds, asOf } = input;
  const previousRange = previousPeriod(range);
  const filtered = applyFilters(input.rows, input.filters);
  const currentRows = filtered.filter((r) => r.date >= range.from && r.date <= range.to);
  const previousRows = filtered.filter((r) => r.date >= previousRange.from && r.date <= previousRange.to);

  const current = summarize(currentRows);
  const previous = summarize(previousRows);
  const coverage = computeCoverage(currentRows, range);
  const previousCoverage = computeCoverage(previousRows, previousRange);

  const bySpend = (a: Breakdown, b: Breakdown) => b.current.spendCents - a.current.spendCents || a.key.localeCompare(b.key);
  const channels = breakdown(currentRows, previousRows, (r) => r.channel, current.spendCents, false)
    .filter((c) => c.current.rows > 0)
    .sort(bySpend);
  const allCampaigns = breakdown(currentRows, previousRows, (r) => campaignKey(r.channel, r.campaign), current.spendCents, true);
  const campaigns = allCampaigns.filter((c) => c.current.rows > 0).sort(bySpend);

  // Budgets are evaluated against all channels for their scope: a channel filter must not shrink a client budget.
  const pacing = input.budgets
    .map((b) => pacingForBudget(input.rows, b, asOf))
    .filter((p): p is BudgetPacing => p !== null)
    .sort((a, b) => (a.scope === b.scope ? a.label.localeCompare(b.label) : a.scope === 'client' ? -1 : 1));

  const queue = investigate({
    range,
    previousRange,
    currency,
    thresholds,
    campaigns: allCampaigns.map((c) => ({ channel: c.channel, campaign: c.campaign!, current: c.current, previous: c.previous })),
    coverage,
    previousCoverage,
    budgets: pacing,
  });

  const previousHasData = previousCoverage.daysWithData > 0;
  const summary = buildSummary({ range, previousRange, currency, thresholds, current, previous, comparison: compareMetrics(current, previous), previousHasData, coverage, previousCoverage, channels, campaignCount: campaigns.length, queue });

  return {
    range,
    previousRange,
    days: daysInclusive(range.from, range.to),
    currency,
    current,
    previous,
    comparison: compareMetrics(current, previous),
    previousHasData,
    coverage,
    previousCoverage,
    series: dailySeries(currentRows, range),
    previousSeries: dailySeries(previousRows, previousRange),
    channels,
    campaigns,
    pacing,
    queue,
    summary,
  };
}
