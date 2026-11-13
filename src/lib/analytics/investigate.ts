import { change } from './compare';
import type { Coverage } from './coverage';
import { divide } from './metrics';
import { formatChange, formatCount, formatDate, formatDateRange, formatMoney, formatRate, pluralize } from './format';
import type { Pacing } from './pacing';
import type { DateRange, Metrics } from './types';

/**
 * Investigation queue: rule-based observations that deserve a human look.
 *
 * Every item states the rule that fired, the comparison period, the numbers,
 * how much data the observation rests on, and a practical next check.
 * Items are observations, never causes, and never recommend moving budget.
 */
export interface Thresholds {
  /** Flag a campaign when spend moves by at least this fraction vs the previous period. */
  spendChangePct: number;
  /** Flag a campaign when CPA rises by at least this fraction vs the previous period. */
  cpaIncreasePct: number;
  /** Minimum conversions (in each period) before CPA is judged at all. */
  minConversions: number;
  /** Minimum spend (minor units) in a period before a campaign is evaluated. */
  minSpendCents: number;
  /** Flag a budget when the linear projection misses the budget by at least this fraction. */
  pacingTolerancePct: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  spendChangePct: 0.3,
  cpaIncreasePct: 0.25,
  minConversions: 10,
  minSpendCents: 10_000,
  pacingTolerancePct: 0.1,
};

export type InvestigationKind = 'missing_dates' | 'pacing' | 'cpa_deterioration' | 'spend_change' | 'no_conversions' | 'low_volume';
export type Priority = 'high' | 'medium' | 'low';

export interface Evidence {
  label: string;
  current: string;
  previous: string | null;
  change: string | null;
}

export interface InvestigationItem {
  id: string;
  kind: InvestigationKind;
  priority: Priority;
  /** What the item is about, e.g. "Meta Ads / Prospecting". */
  subject: string;
  channel: string | null;
  campaign: string | null;
  title: string;
  /** The rule that fired, including the threshold values used. */
  condition: string;
  /** The period(s) being compared. */
  comparison: string;
  evidence: Evidence[];
  /** How much data the observation rests on, and its limits. */
  sufficiency: string;
  /** A practical next check. Never a causal claim or a budget instruction. */
  nextCheck: string;
}

export interface CampaignPeriods {
  channel: string;
  campaign: string;
  current: Metrics;
  previous: Metrics;
}

export interface BudgetPacing {
  budgetId: string;
  label: string;
  scope: 'client' | 'campaign';
  channel: string | null;
  campaign: string | null;
  pacing: Pacing;
  /** Elapsed days in the budget period that have no rows for this scope. */
  elapsedDaysWithoutData: number;
}

export interface InvestigateInput {
  range: DateRange;
  previousRange: DateRange;
  currency: string;
  thresholds: Thresholds;
  campaigns: CampaignPeriods[];
  coverage: Coverage;
  previousCoverage: Coverage;
  budgets: BudgetPacing[];
}

const pct = (fraction: number): string => `${Math.round(fraction * 100)}%`;
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const KIND_ORDER: Record<InvestigationKind, number> = { missing_dates: 0, pacing: 1, cpa_deterioration: 2, spend_change: 3, no_conversions: 4, low_volume: 5 };

export const KIND_LABEL: Record<InvestigationKind, string> = {
  missing_dates: 'Missing data',
  pacing: 'Budget pacing',
  cpa_deterioration: 'CPA increase',
  spend_change: 'Spend change',
  no_conversions: 'No conversions',
  low_volume: 'Low volume',
};

function listDates(dates: string[]): string {
  const shown = dates.slice(0, 4).map((d) => formatDate(d, { year: false }));
  return dates.length > 4 ? `${shown.join(', ')} and ${dates.length - 4} more` : shown.join(', ');
}

export function investigate(input: InvestigateInput): InvestigationItem[] {
  const { range, previousRange, currency, thresholds: t, campaigns, coverage, previousCoverage, budgets } = input;
  const money = (c: number | null) => formatMoney(c, currency);
  const items: InvestigationItem[] = [];
  const comparison = `${formatDateRange(range.from, range.to)} vs previous ${pluralize(coverage.daysInRange, 'day')} (${formatDateRange(previousRange.from, previousRange.to)})`;
  const previousHasData = previousCoverage.daysWithData > 0;
  const coverageNote = (): string => {
    const notes: string[] = [];
    if (!coverage.complete) notes.push(`current period has data for ${coverage.daysWithData} of ${coverage.daysInRange} days`);
    if (previousCoverage.daysWithData < previousCoverage.daysInRange || previousCoverage.channelGaps.length) {
      notes.push(`previous period has data for ${previousCoverage.daysWithData} of ${previousCoverage.daysInRange} days`);
    }
    return notes.length ? ` Coverage is incomplete (${notes.join('; ')}), so part of the difference may be missing data rather than a real change.` : ' Both periods have data for every day.';
  };

  // 1. Missing reporting dates: everything else depends on complete data, so this ranks first.
  for (const gap of coverage.channelGaps) {
    items.push({
      id: `missing_dates:${gap.channel}`,
      kind: 'missing_dates',
      priority: 'high',
      subject: gap.channel,
      channel: gap.channel,
      campaign: null,
      title: `${gap.channel} has ${pluralize(gap.missingDates.length, 'day')} with no data`,
      condition: 'A channel has dates with no rows between its first and last reported day in the selected period.',
      comparison: formatDateRange(range.from, range.to),
      evidence: [{ label: 'Dates without rows', current: listDates(gap.missingDates), previous: null, change: null }],
      sufficiency: 'A missing date is unknown, not zero. Totals, comparisons and pacing for this period may be understated until the gap is filled.',
      nextCheck: `Re-export ${gap.channel} for these dates and import the file. If delivery was paused, confirm that in the platform so the gap is explained.`,
    });
  }
  if (coverage.lastDate && coverage.trailingDaysWithoutData > 0) {
    items.push({
      id: 'missing_dates:trailing',
      kind: 'missing_dates',
      priority: 'medium',
      subject: 'All channels',
      channel: null,
      campaign: null,
      title: `Data ends ${formatDate(coverage.lastDate)}, ${pluralize(coverage.trailingDaysWithoutData, 'day')} before the period end`,
      condition: 'The selected period extends past the last imported date.',
      comparison: formatDateRange(range.from, range.to),
      evidence: [
        { label: 'Last date with data', current: formatDate(coverage.lastDate), previous: null, change: null },
        { label: 'Days with data', current: `${coverage.daysWithData} of ${coverage.daysInRange}`, previous: null, change: null },
      ],
      sufficiency: 'The current period is partial, so comparing it with a full previous period will understate current totals.',
      nextCheck: 'Import the latest exports, or shorten the date range to end on the last date with data.',
    });
  }

  // 2. Budget pacing.
  for (const b of budgets) {
    const p = b.pacing;
    if (p.phase !== 'in_progress' || p.projectedVariance === null || Math.abs(p.projectedVariance) < t.pacingTolerancePct) continue;
    const over = p.projectedVariance > 0;
    items.push({
      id: `pacing:${b.budgetId}`,
      kind: 'pacing',
      priority: over ? 'high' : 'medium',
      subject: b.label,
      channel: b.channel,
      campaign: b.campaign,
      title: `${b.label}: linear projection is ${pct(Math.abs(p.projectedVariance))} ${over ? 'over' : 'under'} budget`,
      condition: `Linear projection differs from the budget by at least ${pct(t.pacingTolerancePct)}.`,
      comparison: `Budget period ${formatDateRange(p.period.from, p.period.to)}, as of ${formatDate(p.asOf)} (day ${p.elapsedDays} of ${p.totalDays})`,
      evidence: [
        { label: 'Budget', current: money(p.budgetCents), previous: null, change: null },
        { label: 'Observed spend', current: money(p.spendCents), previous: null, change: null },
        { label: 'Expected by now (even pacing)', current: money(p.expectedCents), previous: null, change: null },
        { label: 'Linear projection', current: money(p.projectedCents), previous: null, change: null },
      ],
      sufficiency:
        `Based on ${p.elapsedDays} of ${p.totalDays} days. The projection assumes spend continues at the average daily rate so far.` +
        (b.elapsedDaysWithoutData > 0 ? ` ${pluralize(b.elapsedDaysWithoutData, 'elapsed day')} have no data, so observed spend may be understated.` : ''),
      nextCheck: over
        ? 'Check daily caps and scheduled changes for the rest of the period, and confirm with the client whether the budget is a hard limit.'
        : 'Check for paused campaigns, limited delivery or billing issues, and whether spend is planned to ramp up later in the period.',
    });
  }

  // 3-6. Campaign-level rules.
  for (const c of campaigns) {
    const subject = `${c.channel} / ${c.campaign}`;
    const key = JSON.stringify([c.channel, c.campaign]);
    const cur = c.current;
    const prev = c.previous;
    const base = { subject, channel: c.channel, campaign: c.campaign };

    const cpa = change(cur.cpaCents, prev.cpaCents);
    if (cpa.state === 'changed' && cpa.pct! >= t.cpaIncreasePct && cur.conversions >= t.minConversions && prev.conversions >= t.minConversions) {
      const cvrCur = divide(cur.conversions, cur.clicks);
      const cvrPrev = divide(prev.conversions, prev.clicks);
      items.push({
        ...base,
        id: `cpa_deterioration:${key}`,
        kind: 'cpa_deterioration',
        priority: 'high',
        title: `CPA rose ${formatChange(cpa).replace('+', '')} on ${subject}`,
        condition: `CPA increased by at least ${pct(t.cpaIncreasePct)} with at least ${t.minConversions} conversions in each period.`,
        comparison,
        evidence: [
          { label: 'CPA', current: money(cur.cpaCents), previous: money(prev.cpaCents), change: formatChange(cpa) },
          { label: 'Conversions', current: formatCount(cur.conversions), previous: formatCount(prev.conversions), change: formatChange(change(cur.conversions, prev.conversions)) },
          { label: 'Spend', current: money(cur.spendCents), previous: money(prev.spendCents), change: formatChange(change(cur.spendCents, prev.spendCents)) },
          { label: 'CPC', current: money(cur.cpcCents), previous: money(prev.cpcCents), change: formatChange(change(cur.cpcCents, prev.cpcCents)) },
          { label: 'Click-to-conversion rate', current: formatRate(cvrCur), previous: formatRate(cvrPrev), change: formatChange(change(cvrCur, cvrPrev)) },
        ],
        sufficiency: `Both periods meet the minimum of ${t.minConversions} conversions.${coverageNote()} Conversion counts can still change as platforms attribute late conversions.`,
        nextCheck: 'Compare CPC and click-to-conversion rate to see which one moved, then verify conversion tracking and review audience, creative and landing-page changes made in the period.',
      });
    }

    if (previousHasData) {
      const spend = change(cur.spendCents, prev.spendCents);
      const bigEnough = Math.max(cur.spendCents, prev.spendCents) >= t.minSpendCents;
      const shared = {
        ...base,
        id: `spend_change:${key}`,
        kind: 'spend_change' as const,
        comparison,
        evidence: [
          { label: 'Spend', current: money(cur.spendCents), previous: money(prev.spendCents), change: formatChange(spend) },
          { label: 'Conversions', current: formatCount(cur.conversions), previous: formatCount(prev.conversions), change: formatChange(change(cur.conversions, prev.conversions)) },
        ],
      };
      if (bigEnough && spend.state === 'new') {
        items.push({
          ...shared,
          priority: 'low',
          title: `New activity on ${subject}`,
          condition: `Spend of at least ${money(t.minSpendCents)} in this period and none in the previous period.`,
          sufficiency: `There is no earlier baseline, so no percentage change is shown.${coverageNote()}`,
          nextCheck: 'Confirm the launch date and budget match the plan, and agree with the client how long to wait before judging results.',
        });
      } else if (bigEnough && spend.state === 'changed' && cur.spendCents === 0) {
        items.push({
          ...shared,
          priority: 'medium',
          title: `Spend stopped on ${subject}`,
          condition: `Spend of at least ${money(t.minSpendCents)} in the previous period and none in this period.`,
          sufficiency: `Zero spend can mean a pause, an ended flight, a billing problem or rows missing from the export.${coverageNote()}`,
          nextCheck: 'Confirm in the platform whether the campaign was paused or ended on purpose.',
        });
      } else if (bigEnough && spend.state === 'changed' && Math.abs(spend.pct!) >= t.spendChangePct) {
        const up = spend.pct! > 0;
        items.push({
          ...shared,
          priority: 'medium',
          title: `Spend ${up ? 'up' : 'down'} ${formatChange(spend).replace(/^[+−]/, '')} on ${subject}`,
          condition: `Spend changed by at least ${pct(t.spendChangePct)} and reached at least ${money(t.minSpendCents)} in one of the periods.`,
          sufficiency: `Daily totals are compared across two equal-length periods.${coverageNote()}`,
          nextCheck: 'Check the platform change history for budget, bid or audience edits, and confirm whether the change was planned.',
        });
      }
    }

    if (cur.spendCents >= t.minSpendCents && cur.conversions === 0) {
      items.push({
        ...base,
        id: `no_conversions:${key}`,
        kind: 'no_conversions',
        priority: 'medium',
        title: `${subject} spent ${money(cur.spendCents)} with no reported conversions`,
        condition: `Spend of at least ${money(t.minSpendCents)} and zero reported conversions in the period.`,
        comparison: formatDateRange(range.from, range.to),
        evidence: [
          { label: 'Spend', current: money(cur.spendCents), previous: null, change: null },
          { label: 'Clicks', current: formatCount(cur.clicks), previous: null, change: null },
          { label: 'Conversions', current: '0', previous: null, change: null },
        ],
        sufficiency: 'Zero reported conversions does not prove zero results: the campaign may have an awareness goal, a long sales cycle, or a tracking gap.',
        nextCheck: 'Verify the conversion action is assigned and firing, and confirm what outcome this campaign is expected to drive.',
      });
    } else if (cur.spendCents >= t.minSpendCents && cur.conversions > 0 && cur.conversions < t.minConversions) {
      items.push({
        ...base,
        id: `low_volume:${key}`,
        kind: 'low_volume',
        priority: 'low',
        title: `${subject} has only ${pluralize(cur.conversions, 'conversion')}`,
        condition: `Fewer than ${t.minConversions} conversions on spend of at least ${money(t.minSpendCents)}.`,
        comparison: formatDateRange(range.from, range.to),
        evidence: [
          { label: 'Conversions', current: formatCount(cur.conversions), previous: null, change: null },
          { label: 'Spend', current: money(cur.spendCents), previous: null, change: null },
          { label: 'CPA', current: money(cur.cpaCents), previous: null, change: null },
        ],
        sufficiency: `With fewer than ${t.minConversions} conversions, one or two extra conversions would move CPA and ROAS substantially. Treat them as directional only.`,
        nextCheck: 'Use a longer date range before drawing conclusions, and avoid quoting this campaign’s CPA or ROAS to the client as a trend.',
      });
    }
  }

  return items.sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.subject.localeCompare(b.subject),
  );
}
