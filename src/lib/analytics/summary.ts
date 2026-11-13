import type { MetricsComparison } from './compare';
import type { Coverage } from './coverage';
import { formatChange, formatCount, formatDateRange, formatMoney, formatPoints, formatRate, formatRoas, pluralize } from './format';
import type { InvestigationItem, Thresholds } from './investigate';
import type { DateRange, Metrics } from './types';

/**
 * Rule-based summary. No model is involved: each sentence is a template filled
 * with numbers from the analytics layer, sorted into what can be stated plainly,
 * what needs a caveat, and what to check next.
 */
export interface Summary {
  headline: string;
  /** Observations the data supports directly. */
  confident: string[];
  /** Statements that are true as reported but need context before they reach a client. */
  caveats: string[];
  /** Suggested investigations, taken from the highest-priority queue items. */
  nextChecks: string[];
}

export const METHOD_NOTES: readonly string[] = [
  'Ratios (CTR, CPC, CPA, ROAS) are calculated from summed totals for the period, not by averaging daily or campaign ratios.',
  'A ratio with a zero denominator is shown as N/A rather than zero.',
  'Comparisons use the equal-length period immediately before the selected dates; both periods include their start and end dates.',
  'Change in a rate such as CTR is shown in percentage points; change in an amount is shown as a percentage.',
  'A date with no imported rows is treated as unknown, not as zero activity.',
  'Revenue and conversions are as reported by each ad platform. Platforms use different attribution windows and can credit the same sale more than once, so channel totals are not deduplicated business revenue.',
  'ROAS is reported revenue divided by spend. It is not profit and does not show incremental impact.',
  'Budget projections are linear: average daily spend so far, extended to the end of the budget period.',
  'Money is stored in minor units and summed exactly; rounding is applied only when a figure is displayed.',
];

export interface SummaryInput {
  range: DateRange;
  previousRange: DateRange;
  currency: string;
  thresholds: Thresholds;
  current: Metrics;
  previous: Metrics;
  comparison: MetricsComparison;
  previousHasData: boolean;
  coverage: Coverage;
  previousCoverage: Coverage;
  channels: Array<{ channel: string; current: Metrics; spendShare: number | null }>;
  campaignCount: number;
  queue: InvestigationItem[];
}

const direction = (pct: number | null, up = 'up', down = 'down'): string => ((pct ?? 0) >= 0 ? up : down);

export function buildSummary(i: SummaryInput): Summary {
  const { current: cur, previous: prev, comparison: cmp, currency, coverage } = i;
  const money = (c: number | null) => formatMoney(c, currency);
  const period = formatDateRange(i.range.from, i.range.to);
  const confident: string[] = [];
  const caveats: string[] = [];

  if (cur.rows === 0) {
    return {
      headline: `No data for ${period}.`,
      confident: [],
      caveats: ['There are no imported rows for the selected dates and filters. This means the data is missing, not that nothing was spent.'],
      nextChecks: ['Import campaign data covering these dates, or choose a different date range.'],
    };
  }

  const comparable = i.previousHasData && coverage.complete && i.previousCoverage.complete;
  const prevPeriod = formatDateRange(i.previousRange.from, i.previousRange.to);

  confident.push(`Spend was ${money(cur.spendCents)} across ${pluralize(i.campaignCount, 'campaign')} in ${pluralize(i.channels.length, 'channel')} (${period}).`);
  if (comparable && cmp.spend.state === 'changed') {
    confident.push(`Spend was ${direction(cmp.spend.pct)} ${formatChange(cmp.spend).replace(/^[+−]/, '')} on the previous ${pluralize(coverage.daysInRange, 'day')} (${money(prev.spendCents)}, ${prevPeriod}).`);
  }
  if (cur.conversions > 0) {
    let s = `Platforms reported ${pluralize(cur.conversions, 'conversion')} at a cost per acquisition of ${money(cur.cpaCents)}`;
    if (comparable && cmp.conversions.state === 'changed') {
      s += `; conversions were ${direction(cmp.conversions.pct)} ${formatChange(cmp.conversions).replace(/^[+−]/, '')} from ${formatCount(prev.conversions)}`;
      if (cmp.cpa.state === 'changed') s += ` and CPA moved ${formatChange(cmp.cpa)} from ${money(prev.cpaCents)}`;
    }
    confident.push(`${s}.`);
  } else {
    caveats.push('No conversions were reported in this period. That can reflect campaign goals or tracking, so confirm tracking before discussing results.');
  }
  if (cur.ctr !== null) {
    let s = `Click-through rate was ${formatRate(cur.ctr)} on ${formatCount(cur.impressions)} impressions`;
    if (comparable && cmp.ctr.points !== null) s += ` (${formatPoints(cmp.ctr)} on the previous period)`;
    confident.push(`${s}.`);
  }
  const top = i.channels[0];
  if (top && top.spendShare !== null && i.channels.length > 1) {
    confident.push(`${top.channel} was the largest channel at ${formatRate(top.spendShare, 0)} of spend (${money(top.current.spendCents)}).`);
  }

  if (cur.revenueCents > 0) {
    caveats.push(
      `Platforms reported ${money(cur.revenueCents)} in revenue, a ROAS of ${formatRoas(cur.roas)}. This is platform-attributed revenue: channels can each claim the same order, so it is not deduplicated revenue, profit, or proof of incremental impact.`,
    );
  } else {
    caveats.push('No revenue was reported for this period, so ROAS is not available. Where the goal is leads rather than sales, value is usually measured outside the ad platforms.');
  }
  if (!coverage.complete) {
    caveats.push(`Data covers ${coverage.daysWithData} of ${coverage.daysInRange} days in this period${coverage.channelGaps.length ? `, with gaps in ${coverage.channelGaps.map((g) => g.channel).join(', ')}` : ''}. Totals may be understated.`);
  }
  if (!i.previousHasData) {
    caveats.push(`There is no data for the previous period (${prevPeriod}), so period-over-period changes are not shown.`);
  } else if (!comparable) {
    caveats.push('The current or previous period has incomplete data, so period-over-period changes should be read as indicative only.');
  }
  if (cur.conversions > 0 && cur.conversions < i.thresholds.minConversions) {
    caveats.push(`CPA is based on only ${pluralize(cur.conversions, 'conversion')}; treat it as directional.`);
  }

  const nextChecks = i.queue.slice(0, 4).map((q) => `${q.subject}: ${q.nextCheck}`);
  if (!nextChecks.length) nextChecks.push('No rules were triggered for this period. Confirm conversion definitions and attribution windows are unchanged before presenting.');

  const headline =
    comparable && cmp.spend.state === 'changed'
      ? `${money(cur.spendCents)} spent, ${formatChange(cmp.spend)} on the previous period; ${pluralize(i.queue.length, 'item')} to review.`
      : `${money(cur.spendCents)} spent in ${period}; ${pluralize(i.queue.length, 'item')} to review.`;

  return { headline, confident, caveats, nextChecks };
}
