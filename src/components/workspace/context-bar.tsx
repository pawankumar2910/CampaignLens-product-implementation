import Link from 'next/link';
import { daysInclusive, formatDate, formatDateRange, pluralize, previousPeriod, type DateRange } from '@/lib/analytics';
import type { RangePreset } from '@/lib/page';

/**
 * Persistent context for a client's pages: which period is selected, what it is
 * compared with, and how fresh the data is. It is a plain GET form, so the
 * selection lives in the URL, survives reloads and can be shared with a colleague.
 */
export function ContextBar({
  basePath,
  range,
  presets,
  dataThrough,
  channels,
  channel,
  extraParams,
}: {
  basePath: string;
  range: DateRange;
  presets: RangePreset[];
  dataThrough: string | null;
  channels?: string[];
  channel?: string | null;
  extraParams?: Record<string, string | undefined>;
}) {
  const prev = previousPeriod(range);
  const days = daysInclusive(range.from, range.to);
  const hidden = Object.entries(extraParams ?? {}).filter((e): e is [string, string] => !!e[1]);
  const presetHref = (r: DateRange) => {
    const params = new URLSearchParams({ from: r.from, to: r.to });
    if (channel) params.set('channel', channel);
    for (const [k, v] of hidden) params.set(k, v);
    return `${basePath}?${params.toString()}`;
  };
  return (
    <section aria-label="Period and filters" className="panel mb-5 px-4 py-3 print:hidden">
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
        {hidden.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div>
          <label htmlFor="range-from" className="label">
            From
          </label>
          <input id="range-from" className="input num w-[9.5rem]" type="date" name="from" defaultValue={range.from} required />
        </div>
        <div>
          <label htmlFor="range-to" className="label">
            To
          </label>
          <input id="range-to" className="input num w-[9.5rem]" type="date" name="to" defaultValue={range.to} required />
        </div>
        {channels ? (
          <div>
            <label htmlFor="range-channel" className="label">
              Channel
            </label>
            <select id="range-channel" name="channel" className="select min-w-[10rem]" defaultValue={channel ?? ''}>
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button type="submit" className="btn">
          Apply
        </button>
        <div className="ml-auto flex min-w-0 flex-wrap gap-1" role="group" aria-label="Quick periods">
          {presets.map((p) => {
            const current = p.range.from === range.from && p.range.to === range.to;
            return (
              <Link key={p.label} href={presetHref(p.range)} aria-current={current ? 'true' : undefined} className={`btn btn-sm ${current ? '!border-brand !bg-brand-soft !text-brand-strong' : 'btn-quiet'}`}>
                {p.label}
              </Link>
            );
          })}
        </div>
      </form>
      <p className="muted mt-2.5 border-t border-line pt-2 text-[0.82rem]">
        <span className="font-semibold text-ink-2">{formatDateRange(range.from, range.to)}</span> ({pluralize(days, 'day')}, both ends included) compared with the previous {pluralize(days, 'day')}:{' '}
        {formatDateRange(prev.from, prev.to)}. {dataThrough ? `Data imported through ${formatDate(dataThrough)}.` : 'No data imported yet.'}
      </p>
    </section>
  );
}
