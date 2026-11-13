import { daysInclusive } from './dates';
import type { DateRange } from './types';

/**
 * Budget pacing for one budget period (inclusive calendar dates).
 *
 *   expected  = budget x elapsed days / total days          (even daily spend reference)
 *   projected = observed spend / elapsed days x total days  (linear projection, not a forecast)
 *
 * Both assume even daily spend. Real delivery is rarely even, so the UI labels the
 * projection as linear and shows how many elapsed days have no data.
 */
export type PacingPhase = 'not_started' | 'in_progress' | 'complete';

export interface Pacing {
  period: DateRange;
  asOf: string;
  phase: PacingPhase;
  budgetCents: number;
  spendCents: number;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  expectedCents: number;
  /** null before the period starts (nothing to extrapolate from). */
  projectedCents: number | null;
  remainingCents: number;
  /** spend / budget as a fraction. */
  usedRatio: number;
  /** (spend - expected) / expected. null when expected is zero. */
  varianceToExpected: number | null;
  /** (projected - budget) / budget. null when there is no projection. */
  projectedVariance: number | null;
}

export interface PacingInput {
  budgetCents: number;
  period: DateRange;
  /** Spend is counted from period start through this date, inclusive. */
  asOf: string;
  /** Observed spend from period start through `asOf`. */
  spendCents: number;
}

export function computePacing(input: PacingInput): Pacing | null {
  const { budgetCents, period, asOf, spendCents } = input;
  const totalDays = daysInclusive(period.from, period.to);
  if (!(budgetCents > 0) || totalDays <= 0) return null;

  const phase: PacingPhase = asOf < period.from ? 'not_started' : asOf >= period.to ? 'complete' : 'in_progress';
  const elapsedDays = phase === 'not_started' ? 0 : Math.min(totalDays, daysInclusive(period.from, asOf));
  const expectedCents = Math.round((budgetCents * elapsedDays) / totalDays);
  const projectedCents = elapsedDays === 0 ? null : phase === 'complete' ? spendCents : Math.round((spendCents / elapsedDays) * totalDays);

  return {
    period,
    asOf,
    phase,
    budgetCents,
    spendCents,
    totalDays,
    elapsedDays,
    remainingDays: totalDays - elapsedDays,
    expectedCents,
    projectedCents,
    remainingCents: budgetCents - spendCents,
    usedRatio: spendCents / budgetCents,
    varianceToExpected: expectedCents === 0 ? null : (spendCents - expectedCents) / expectedCents,
    projectedVariance: projectedCents === null ? null : (projectedCents - budgetCents) / budgetCents,
  };
}
