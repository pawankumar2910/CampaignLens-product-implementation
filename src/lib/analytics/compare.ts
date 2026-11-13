import type { Metrics } from './types';

/**
 * Period-over-period change for a count or amount (spend, conversions, CPA...).
 *
 * - `changed`     both periods have a value and the previous one is non-zero: `pct` is defined.
 * - `new`         previous was exactly zero and current is positive: growth from zero has no
 *                 meaningful percentage, so we say "new activity" instead of Infinity.
 * - `flat`        both are zero.
 * - `unavailable` either value is unavailable (for example CPA with zero conversions).
 */
export type ChangeState = 'changed' | 'new' | 'flat' | 'unavailable';

export interface Change {
  current: number | null;
  previous: number | null;
  state: ChangeState;
  /** current - previous, when both exist. */
  delta: number | null;
  /** Relative change as a fraction (0.25 = +25%). Only for state `changed`. */
  pct: number | null;
}

export function change(current: number | null, previous: number | null): Change {
  if (current === null || previous === null) return { current, previous, state: 'unavailable', delta: null, pct: null };
  const delta = current - previous;
  if (previous === 0) {
    return { current, previous, state: current === 0 ? 'flat' : 'new', delta, pct: null };
  }
  return { current, previous, state: 'changed', delta, pct: delta / Math.abs(previous) };
}

/**
 * Change for a rate such as CTR. Rates get two different numbers that must not be confused:
 * `points` is the percentage-point difference (2.0% -> 2.5% is +0.5 pts), while
 * `pct` is the relative change (+25%).
 */
export interface RateChange extends Change {
  /** Percentage-point difference: (current - previous) * 100. */
  points: number | null;
}

export function rateChange(current: number | null, previous: number | null): RateChange {
  const base = change(current, previous);
  return { ...base, points: base.delta === null ? null : base.delta * 100 };
}

export interface MetricsComparison {
  spend: Change;
  revenue: Change;
  impressions: Change;
  clicks: Change;
  conversions: Change;
  cpc: Change;
  cpa: Change;
  roas: Change;
  ctr: RateChange;
}

export function compareMetrics(current: Metrics, previous: Metrics): MetricsComparison {
  return {
    spend: change(current.spendCents, previous.spendCents),
    revenue: change(current.revenueCents, previous.revenueCents),
    impressions: change(current.impressions, previous.impressions),
    clicks: change(current.clicks, previous.clicks),
    conversions: change(current.conversions, previous.conversions),
    cpc: change(current.cpcCents, previous.cpcCents),
    cpa: change(current.cpaCents, previous.cpaCents),
    roas: change(current.roas, previous.roas),
    ctr: rateChange(current.ctr, previous.ctr),
  };
}
