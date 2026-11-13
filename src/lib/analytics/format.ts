import type { Change, RateChange } from './compare';

/**
 * Display formatting. One locale (en-US) everywhere so server and client render
 * identically. Rounding happens only here, at display time, never in stored values.
 *
 * Money rule: totals show whole units on dashboards (`compact`) and exact minor
 * units in tables, reports and exports. Unit costs (CPC, CPA) always show 2 decimals.
 */
export const UNAVAILABLE = 'N/A';

const moneyFormatters = new Map<string, Intl.NumberFormat>();
function moneyFormatter(currency: string, digits: number, display: 'symbol' | 'code'): Intl.NumberFormat {
  const key = `${currency}:${digits}:${display}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: display === 'code' ? 'code' : 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    moneyFormatters.set(key, f);
  }
  return f;
}

export interface MoneyOptions {
  /** Round to whole currency units (dashboard headline figures). */
  whole?: boolean;
  /** Use the ISO code instead of a symbol (PDF fonts lack some symbols). */
  code?: boolean;
}

export function formatMoney(cents: number | null, currency: string, opts: MoneyOptions = {}): string {
  if (cents === null || !Number.isFinite(cents)) return UNAVAILABLE;
  const text = moneyFormatter(currency, opts.whole ? 0 : 2, opts.code ? 'code' : 'symbol').format(cents / 100);
  // Intl separates the code with a non-breaking space; keep it but normalise for PDF fonts.
  return opts.code ? text.replace(/ /g, ' ') : text;
}

const intFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const formatInteger = (n: number | null): string => (n === null || !Number.isFinite(n) ? UNAVAILABLE : intFormatter.format(n));
/** Conversions can be fractional; show up to 2 decimals without padding. */
export const formatCount = (n: number | null): string => (n === null || !Number.isFinite(n) ? UNAVAILABLE : decFormatter.format(n));

export const formatRate = (ratio: number | null, digits = 2): string =>
  ratio === null || !Number.isFinite(ratio) ? UNAVAILABLE : `${(ratio * 100).toFixed(digits)}%`;

export const formatRoas = (roas: number | null): string => (roas === null || !Number.isFinite(roas) ? UNAVAILABLE : `${roas.toFixed(2)}x`);

const sign = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '');

/** "+12.5%", "−3.0%", "New", "No change", or "N/A". */
export function formatChange(c: Change): string {
  if (c.state === 'unavailable') return UNAVAILABLE;
  if (c.state === 'new') return 'New';
  if (c.state === 'flat') return 'No change';
  const pct = (c.pct ?? 0) * 100;
  if (Math.abs(pct) < 0.05) return '0.0%';
  return `${sign(pct)}${Math.abs(pct).toFixed(1)}%`;
}

/** Percentage-point change for rates: "+0.50 pts". */
export function formatPoints(c: RateChange): string {
  if (c.points === null) return UNAVAILABLE;
  if (Math.abs(c.points) < 0.005) return '0.00 pts';
  return `${sign(c.points)}${Math.abs(c.points).toFixed(2)} pts`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Nov 2026" from an ISO calendar date, without any timezone conversion. */
export function formatDate(iso: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = iso.split('-');
  const month = MONTHS[Number(m) - 1] ?? m;
  return opts.year === false ? `${Number(d)} ${month}` : `${Number(d)} ${month} ${y}`;
}

export function formatDateRange(from: string, to: string): string {
  if (from === to) return formatDate(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatDate(from, { year: !sameYear })} – ${formatDate(to)}`;
}

export const pluralize = (n: number, one: string, many = `${one}s`): string => `${formatCount(n)} ${n === 1 ? one : many}`;
