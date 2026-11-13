import type { CampaignDay, Metrics, Totals } from './types';

/** Conversions carry at most 4 decimals; summing as scaled integers avoids float drift. */
export const CONVERSION_SCALE = 10_000;

/** Division that reports "unavailable" (null) instead of Infinity/NaN for a zero denominator. */
export const divide = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

export const EMPTY_TOTALS: Totals = { spendCents: 0, revenueCents: 0, impressions: 0, clicks: 0, conversions: 0, rows: 0 };

export function sumTotals(rows: readonly CampaignDay[]): Totals {
  let spendCents = 0;
  let revenueCents = 0;
  let impressions = 0;
  let clicks = 0;
  let conversionsScaled = 0;
  for (const r of rows) {
    spendCents += r.spendCents;
    revenueCents += r.revenueCents;
    impressions += r.impressions;
    clicks += r.clicks;
    conversionsScaled += Math.round(r.conversions * CONVERSION_SCALE);
  }
  return { spendCents, revenueCents, impressions, clicks, conversions: conversionsScaled / CONVERSION_SCALE, rows: rows.length };
}

/**
 * Ratios are always computed from summed numerators and denominators.
 * Averaging per-row ratios would weight a $5 day the same as a $5,000 day.
 */
export function toMetrics(t: Totals): Metrics {
  return {
    ...t,
    ctr: divide(t.clicks, t.impressions),
    cpcCents: divide(t.spendCents, t.clicks),
    cpaCents: divide(t.spendCents, t.conversions),
    roas: divide(t.revenueCents, t.spendCents),
  };
}

export const summarize = (rows: readonly CampaignDay[]): Metrics => toMetrics(sumTotals(rows));

export function groupRows<K extends string>(rows: readonly CampaignDay[], keyOf: (row: CampaignDay) => K): Map<K, CampaignDay[]> {
  const groups = new Map<K, CampaignDay[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  return groups;
}

export function summarizeBy<K extends string>(rows: readonly CampaignDay[], keyOf: (row: CampaignDay) => K): Array<{ key: K; metrics: Metrics }> {
  return [...groupRows(rows, keyOf)].map(([key, list]) => ({ key, metrics: summarize(list) }));
}
