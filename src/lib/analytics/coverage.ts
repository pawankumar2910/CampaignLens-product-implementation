import { addDays, daysInclusive, eachDate } from './dates';
import { summarize } from './metrics';
import type { CampaignDay, DateRange, Metrics } from './types';

/**
 * Coverage answers "which days do we actually have data for?".
 * A date with no rows is *unknown*, not zero activity: the platform may have spent
 * money that simply was not exported. Charts show a gap and pacing carries a caveat.
 */
export interface ChannelGap {
  channel: string;
  /** Dates inside the range, between the channel's first and last reported day, with no rows. */
  missingDates: string[];
}

export interface Coverage {
  range: DateRange;
  daysInRange: number;
  /** Days in the range with at least one row for any channel. */
  daysWithData: number;
  /** First and last dates with data inside the range, or null when the range is empty. */
  firstDate: string | null;
  lastDate: string | null;
  /** Days at the end of the range after the last reported date (data not imported yet). */
  trailingDaysWithoutData: number;
  /** Days at the start of the range before the first reported date. */
  leadingDaysWithoutData: number;
  channelGaps: ChannelGap[];
  /** True when every day in the range has data and no channel has interior gaps. */
  complete: boolean;
}

export function computeCoverage(rows: readonly CampaignDay[], range: DateRange): Coverage {
  const daysInRange = daysInclusive(range.from, range.to);
  const inRange = rows.filter((r) => r.date >= range.from && r.date <= range.to);
  const allDates = new Set(inRange.map((r) => r.date));
  const sorted = [...allDates].sort();
  const firstDate = sorted[0] ?? null;
  const lastDate = sorted.at(-1) ?? null;

  const byChannel = new Map<string, Set<string>>();
  for (const r of inRange) {
    const set = byChannel.get(r.channel) ?? new Set<string>();
    set.add(r.date);
    byChannel.set(r.channel, set);
  }
  const channelGaps: ChannelGap[] = [];
  for (const [channel, dates] of [...byChannel].sort(([a], [b]) => a.localeCompare(b))) {
    const list = [...dates].sort();
    const first = list[0]!;
    const last = list.at(-1)!;
    // Only interior gaps count: a channel that launched mid-range is not "missing" before launch.
    const missingDates = eachDate({ from: first, to: last }).filter((d) => !dates.has(d));
    if (missingDates.length) channelGaps.push({ channel, missingDates });
  }

  const trailing = lastDate ? daysInclusive(addDays(lastDate, 1), range.to) : daysInRange;
  const leading = firstDate ? daysInclusive(range.from, addDays(firstDate, -1)) : 0;
  return {
    range,
    daysInRange,
    daysWithData: allDates.size,
    firstDate,
    lastDate,
    trailingDaysWithoutData: trailing,
    leadingDaysWithoutData: leading,
    channelGaps,
    complete: allDates.size === daysInRange && channelGaps.length === 0,
  };
}

export interface SeriesPoint {
  date: string;
  /** null when no rows exist for the date: rendered as a gap, not as zero. */
  metrics: Metrics | null;
}

export function dailySeries(rows: readonly CampaignDay[], range: DateRange): SeriesPoint[] {
  const byDate = new Map<string, CampaignDay[]>();
  for (const r of rows) {
    if (r.date < range.from || r.date > range.to) continue;
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }
  return eachDate(range).map((date) => {
    const list = byDate.get(date);
    return { date, metrics: list ? summarize(list) : null };
  });
}
