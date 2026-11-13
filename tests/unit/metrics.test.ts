import { describe, expect, test } from 'vitest';
import {
  addDays, change, compareMetrics, computeCoverage, computePacing, dailySeries, daysInclusive, detectDateFormat, formatChange, formatDateRange, formatMoney,
  formatPoints, formatRate, formatRoas, isValidDate, monthBounds, parseDateCell, previousPeriod, rateChange, summarize, todayInTimeZone,
} from '@/lib/analytics';
import { day } from './helpers';

describe('metrics: ratios come from summed totals', () => {
  test('single row (ported from the starter)', () => {
    const m = summarize([day('2026-11-01', 'Google', 'Search', 100, 10000, 200, 10, 500)]);
    expect(m.ctr).toBe(0.02);
    expect(m.cpcCents).toBe(50);
    expect(m.cpaCents).toBe(1000);
    expect(m.roas).toBe(5);
  });

  test('weighted totals, never the average of row ratios (ported from the starter)', () => {
    // Row ROAS values are 5.0 and 1.0; their average would be 3.0. The correct figure is 1400 / 1000 = 1.4.
    const m = summarize([day('2026-11-01', 'Google', 'Search', 100, 10000, 200, 10, 500), day('2026-11-02', 'Google', 'Search', 900, 1000, 10, 0, 900)]);
    expect(m.roas).toBe(1.4);
    expect(m.cpaCents).toBe(10000);
    expect(m.ctr).toBe(210 / 11000);
  });

  test('hand-calculated fixture from the build guide', () => {
    // Spend 100 + 200 = 300. Revenue 500 + 600 = 1100. Clicks 500 / impressions 30000. Conversions 18.
    const m = summarize([day('2026-11-01', 'Google Ads', 'Brand search', 100, 10000, 200, 10, 500), day('2026-11-01', 'Meta Ads', 'Prospecting', 200, 20000, 300, 8, 600)]);
    expect(m.spendCents).toBe(30000);
    expect(m.revenueCents).toBe(110000);
    expect(m.ctr! * 100).toBeCloseTo(1.6667, 4);
    expect(m.cpcCents! / 100).toBeCloseTo(0.6, 10);
    expect(m.cpaCents! / 100).toBeCloseTo(16.6667, 4);
    expect(m.roas!).toBeCloseTo(3.6667, 4);
  });

  test('zero denominators are unavailable (null), not zero or Infinity', () => {
    const empty = summarize([]);
    for (const k of ['ctr', 'cpcCents', 'cpaCents', 'roas'] as const) expect(empty[k]).toBeNull();
    const noConversions = summarize([day('2026-11-01', 'G', 'C', 50, 1000, 10, 0, 0)]);
    expect(noConversions.cpaCents).toBeNull();
    expect(noConversions.roas).toBe(0);
  });

  test('fractional conversions sum exactly', () => {
    const m = summarize([day('2026-11-01', 'G', 'C', 1, 10, 1, 0.1, 0), day('2026-11-02', 'G', 'C', 1, 10, 1, 0.2, 0)]);
    expect(m.conversions).toBe(0.3); // 0.1 + 0.2 in floating point is 0.30000000000000004
  });

  test('money sums exactly in minor units', () => {
    const rows = Array.from({ length: 10 }, (_, i) => day(addDays('2026-11-01', i), 'G', 'C', 0.1, 10, 1, 0, 0));
    expect(summarize(rows).spendCents).toBe(100);
  });
});

describe('period comparison', () => {
  test('previous period is the equal-length window immediately before, inclusive', () => {
    expect(previousPeriod({ from: '2026-11-01', to: '2026-11-10' })).toEqual({ from: '2026-10-22', to: '2026-10-31' });
    expect(daysInclusive('2026-10-22', '2026-10-31')).toBe(10);
  });
  test('crosses month and year boundaries', () => {
    expect(previousPeriod({ from: '2027-01-01', to: '2027-01-07' })).toEqual({ from: '2026-12-25', to: '2026-12-31' });
  });
  test('one-day range, including a leap day', () => {
    expect(previousPeriod({ from: '2026-03-01', to: '2026-03-01' })).toEqual({ from: '2026-02-28', to: '2026-02-28' });
    expect(previousPeriod({ from: '2024-03-01', to: '2024-03-01' })).toEqual({ from: '2024-02-29', to: '2024-02-29' });
  });

  test('percentage change, new activity, flat and unavailable are distinct states', () => {
    expect(change(120, 100)).toMatchObject({ state: 'changed', delta: 20, pct: 0.2 });
    expect(change(80, 100).pct).toBeCloseTo(-0.2);
    expect(change(5, 0)).toMatchObject({ state: 'new', pct: null });
    expect(change(0, 0)).toMatchObject({ state: 'flat', pct: null });
    expect(change(null, 10)).toMatchObject({ state: 'unavailable', pct: null });
    expect(change(0, 50)).toMatchObject({ state: 'changed', pct: -1 });
  });

  test('rates report percentage points separately from relative change', () => {
    // CTR 2.0% -> 2.5% is +0.5 percentage points, and +25% relative.
    const c = rateChange(0.025, 0.02);
    expect(c.points).toBeCloseTo(0.5);
    expect(c.pct).toBeCloseTo(0.25);
    expect(formatPoints(c)).toBe('+0.50 pts');
    expect(formatChange(c)).toBe('+25.0%');
  });

  test('compareMetrics marks CPA unavailable when a period has no conversions', () => {
    const cur = summarize([day('2026-11-02', 'G', 'C', 100, 1000, 10, 4, 0)]);
    const prev = summarize([day('2026-11-01', 'G', 'C', 100, 1000, 10, 0, 0)]);
    const cmp = compareMetrics(cur, prev);
    expect(cmp.cpa.state).toBe('unavailable');
    expect(cmp.conversions.state).toBe('new');
    expect(cmp.spend.state).toBe('changed');
    expect(cmp.spend.pct).toBe(0);
  });
});

describe('budget pacing', () => {
  test('day 10 of 30 with 1000 spent on a 6000 budget (ported from the starter)', () => {
    const p = computePacing({ budgetCents: 600000, period: { from: '2026-11-01', to: '2026-11-30' }, asOf: '2026-11-10', spendCents: 100000 })!;
    expect(p.elapsedDays).toBe(10);
    expect(p.totalDays).toBe(30);
    expect(p.expectedCents).toBe(200000);
    expect(p.projectedCents).toBe(300000);
    expect(p.remainingCents).toBe(500000);
    expect(p.varianceToExpected).toBe(-0.5);
    expect(p.projectedVariance).toBe(-0.5);
    expect(p.phase).toBe('in_progress');
  });
  test('leap-year February has 29 days; zero budget gives no pacing', () => {
    expect(computePacing({ budgetCents: 10000, period: monthBounds('2024-02-10'), asOf: '2024-02-29', spendCents: 1000 })!.totalDays).toBe(29);
    expect(computePacing({ budgetCents: 0, period: { from: '2026-11-01', to: '2026-11-30' }, asOf: '2026-11-10', spendCents: 0 })).toBeNull();
  });
  test('before the period there is no projection; after it the projection is the actual spend', () => {
    const period = { from: '2026-11-01', to: '2026-11-30' };
    const before = computePacing({ budgetCents: 100000, period, asOf: '2026-10-31', spendCents: 0 })!;
    expect(before).toMatchObject({ phase: 'not_started', elapsedDays: 0, expectedCents: 0, projectedCents: null });
    const after = computePacing({ budgetCents: 100000, period, asOf: '2026-12-05', spendCents: 90000 })!;
    expect(after).toMatchObject({ phase: 'complete', elapsedDays: 30, projectedCents: 90000, remainingDays: 0 });
  });
});

describe('coverage: missing data is not zero', () => {
  const rows = [
    day('2026-11-01', 'Google', 'A', 10, 100, 1, 0, 0),
    day('2026-11-02', 'Google', 'A', 10, 100, 1, 0, 0),
    day('2026-11-04', 'Google', 'A', 10, 100, 1, 0, 0),
    day('2026-11-03', 'Meta', 'B', 10, 100, 1, 0, 0),
    day('2026-11-04', 'Meta', 'B', 10, 100, 1, 0, 0),
  ];
  test('interior gaps are reported per channel; a later launch is not a gap', () => {
    const c = computeCoverage(rows, { from: '2026-11-01', to: '2026-11-06' });
    expect(c.daysInRange).toBe(6);
    expect(c.daysWithData).toBe(4);
    expect(c.channelGaps).toEqual([{ channel: 'Google', missingDates: ['2026-11-03'] }]);
    expect(c.trailingDaysWithoutData).toBe(2);
    expect(c.leadingDaysWithoutData).toBe(0);
    expect(c.complete).toBe(false);
  });
  test('daily series has null for dates without rows', () => {
    const s = dailySeries(rows, { from: '2026-11-04', to: '2026-11-05' });
    expect(s[0]!.metrics!.spendCents).toBe(2000);
    expect(s[1]).toEqual({ date: '2026-11-05', metrics: null });
  });
});

describe('dates and formatting', () => {
  test('validates real calendar dates', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-2-3')).toBe(false);
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2025-02-29')).toBe(false);
  });
  test('parses only the chosen date format and refuses to guess', () => {
    expect(parseDateCell('03/04/2026', 'MM/DD/YYYY')).toBe('2026-03-04');
    expect(parseDateCell('03/04/2026', 'DD/MM/YYYY')).toBe('2026-04-03');
    expect(parseDateCell('31/04/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseDateCell('2026-11-01', 'MM/DD/YYYY')).toBeNull();
    expect(detectDateFormat(['03/04/2026', '05/06/2026'])).toBeNull(); // ambiguous
    expect(detectDateFormat(['13/04/2026', '05/06/2026'])).toBe('DD/MM/YYYY');
    expect(detectDateFormat(['2026-11-01'])).toBe('YYYY-MM-DD');
  });
  test('today is evaluated in the reporting timezone', () => {
    const instant = new Date('2026-11-12T02:30:00Z');
    expect(todayInTimeZone('America/Los_Angeles', instant)).toBe('2026-11-11');
    expect(todayInTimeZone('Asia/Kolkata', instant)).toBe('2026-11-12');
    expect(todayInTimeZone('Not/AZone', instant)).toBe('2026-11-12');
  });
  test('display formatting', () => {
    expect(formatMoney(299500, 'USD', { whole: true })).toBe('$2,995');
    expect(formatMoney(1234567, 'USD')).toBe('$12,345.67');
    expect(formatMoney(1234567, 'GBP')).toBe('£12,345.67');
    expect(formatMoney(1234567, 'INR', { code: true })).toBe('INR 12,345.67');
    expect(formatMoney(null, 'USD')).toBe('N/A');
    expect(formatRate(0.016667)).toBe('1.67%');
    expect(formatRoas(null)).toBe('N/A');
    expect(formatRoas(3.5426)).toBe('3.54x');
    expect(formatChange(change(90, 100))).toBe('−10.0%');
    expect(formatChange(change(5, 0))).toBe('New');
    expect(formatDateRange('2026-10-22', '2026-11-10')).toBe('22 Oct – 10 Nov 2026');
    expect(formatDateRange('2026-12-25', '2027-01-07')).toBe('25 Dec 2026 – 7 Jan 2027');
  });
});
