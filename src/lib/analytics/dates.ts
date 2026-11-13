import type { DateRange } from './types';

/**
 * Calendar-date helpers. Dates are plain YYYY-MM-DD strings in the client's
 * reporting timezone; arithmetic runs in UTC so DST never shifts a day.
 */
const DAY_MS = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value: string): boolean {
  const m = ISO.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d && y >= 1900;
}

const toMs = (date: string): number => {
  const m = ISO.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};
const fromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: string, days: number): string => fromMs(toMs(date) + days * DAY_MS);

/** Inclusive day count: 2026-11-01..2026-11-10 is 10 days. Returns 0 if `to` is before `from`. */
export function daysInclusive(from: string, to: string): number {
  const n = Math.round((toMs(to) - toMs(from)) / DAY_MS) + 1;
  return n > 0 ? n : 0;
}

export const isValidRange = (r: DateRange): boolean => isValidDate(r.from) && isValidDate(r.to) && r.from <= r.to;

/**
 * The equal-length period immediately before `range`.
 * An N-day range [from, to] compares against [from - N, from - 1]. Both ends inclusive.
 */
export function previousPeriod(range: DateRange): DateRange {
  const n = daysInclusive(range.from, range.to);
  return { from: addDays(range.from, -n), to: addDays(range.from, -1) };
}

export function eachDate(range: DateRange): string[] {
  const out: string[] = [];
  const n = daysInclusive(range.from, range.to);
  for (let i = 0; i < n; i++) out.push(addDays(range.from, i));
  return out;
}

export const inRange = (date: string, r: DateRange): boolean => date >= r.from && date <= r.to;

export function monthBounds(date: string): DateRange {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}

/** Today's calendar date in an IANA timezone. Falls back to UTC for an unknown zone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const iso = `${get('year')}-${get('month')}-${get('day')}`;
    if (isValidDate(iso)) return iso;
  } catch {
    /* unknown timezone */
  }
  return now.toISOString().slice(0, 10);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export type DateFormat = 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';
export const DATE_FORMATS: readonly DateFormat[] = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'];

/** Parse a date cell in an explicitly chosen format. Returns ISO or null; never guesses. */
export function parseDateCell(raw: string, format: DateFormat): string | null {
  const s = raw.trim();
  let y: string, m: string, d: string;
  if (format === 'YYYY-MM-DD') {
    const r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (!r) return null;
    [y, m, d] = [r[1]!, r[2]!, r[3]!];
  } else {
    const r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (!r) return null;
    [m, d, y] = format === 'MM/DD/YYYY' ? [r[1]!, r[2]!, r[3]!] : [r[2]!, r[1]!, r[3]!];
  }
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isValidDate(iso) ? iso : null;
}

/** Suggest a format from sample cells, or null when the samples are ambiguous or unparseable. */
export function detectDateFormat(samples: string[]): DateFormat | null {
  const cells = samples.map((s) => s.trim()).filter(Boolean);
  if (!cells.length) return null;
  const fits = DATE_FORMATS.filter((f) => cells.every((c) => parseDateCell(c, f) !== null));
  return fits.length === 1 ? fits[0]! : null;
}
