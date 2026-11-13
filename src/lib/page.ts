import { notFound } from 'next/navigation';
import { addDays, monthBounds, type Analysis, type DateRange, type Metrics } from './analytics';
import { NotFoundError, type Actor } from './auth/permissions';
import { requireActor } from './auth/session';
import type { ChartPoint, ChartValues } from '@/components/charts/time-series';
import { loadClientData, resolveRange, type ClientData } from './services/workspace';

/** Run a loader and turn "not found in your agency" into a 404 page. */
export async function orNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export interface ClientPageContext {
  actor: Actor;
  data: ClientData;
  range: DateRange;
  /** `?from=..&to=..` for links that should keep the selected period. */
  rangeQuery: string;
}

/** Shared setup for every page under /c/[clientId]: session, agency-scoped client data, selected period. */
export async function clientPage(params: Promise<{ clientId: string }>, searchParams?: SearchParams): Promise<ClientPageContext> {
  const actor = await requireActor();
  const { clientId } = await params;
  const data = await orNotFound(() => loadClientData(actor, clientId));
  const sp = searchParams ? await searchParams : {};
  const range = resolveRange(data, { from: one(sp.from), to: one(sp.to) });
  return { actor, data, range, rangeQuery: `?from=${range.from}&to=${range.to}` };
}

export interface RangePreset {
  label: string;
  range: DateRange;
}

/** Presets are anchored to the last date with data, so "Last 30 days" always shows data. */
export function rangePresets(data: Pick<ClientData, 'bounds' | 'today'>): RangePreset[] {
  const end = data.bounds?.to ?? data.today;
  const lastN = (n: number): RangePreset => ({ label: `Last ${n} days`, range: { from: addDays(end, -(n - 1)), to: end } });
  const thisMonth = monthBounds(end);
  const lastMonth = monthBounds(addDays(thisMonth.from, -1));
  return [lastN(7), lastN(14), lastN(30), lastN(90), { label: 'Month to date', range: { from: thisMonth.from, to: end } }, { label: 'Last month', range: lastMonth }];
}

const chartValues = (m: Metrics | null): ChartValues | null =>
  m ? { spend: m.spendCents, conversions: m.conversions, cpa: m.cpaCents, roas: m.roas, ctr: m.ctr } : null;

/** Align each day of the period with the same day-offset in the previous period. */
export function toChartPoints(analysis: Pick<Analysis, 'series' | 'previousSeries'>): ChartPoint[] {
  return analysis.series.map((p, i) => {
    const prev = analysis.previousSeries[i];
    return { date: p.date, current: chartValues(p.metrics), previousDate: prev?.date ?? null, previous: chartValues(prev?.metrics ?? null) };
  });
}
