'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { change, formatChange, formatCount, formatDate, formatMoney, formatRate, formatRoas, UNAVAILABLE } from '@/lib/analytics';

/**
 * Daily time series with the previous period overlaid on one shared axis.
 *
 * Accessibility: the chart is keyboard-readable (arrow keys step through days and
 * announce values), the two series differ by dash pattern as well as colour, and
 * the same numbers are available as a table. Days without data are drawn as gaps.
 */
export type ChartMetric = 'spend' | 'conversions' | 'cpa' | 'roas' | 'ctr';

export interface ChartValues {
  spend: number | null;
  conversions: number | null;
  cpa: number | null;
  roas: number | null;
  ctr: number | null;
}

export interface ChartPoint {
  date: string;
  current: ChartValues | null;
  previousDate: string | null;
  previous: ChartValues | null;
}

const METRICS: Array<{ id: ChartMetric; label: string }> = [
  { id: 'spend', label: 'Spend' },
  { id: 'conversions', label: 'Conversions' },
  { id: 'cpa', label: 'CPA' },
  { id: 'roas', label: 'ROAS' },
  { id: 'ctr', label: 'CTR' },
];

function formatValue(metric: ChartMetric, v: number | null, currency: string): string {
  if (v === null) return UNAVAILABLE;
  if (metric === 'spend' || metric === 'cpa') return formatMoney(v, currency);
  if (metric === 'conversions') return formatCount(v);
  if (metric === 'roas') return formatRoas(v);
  return formatRate(v);
}

function formatAxis(metric: ChartMetric, v: number, currency: string): string {
  if (metric === 'spend' || metric === 'cpa') {
    const units = v / 100;
    const symbol = formatMoney(0, currency, { whole: true }).replace(/[\d.,\s]/g, '');
    return units >= 1000 ? `${symbol}${(units / 1000).toFixed(units >= 10000 ? 0 : 1)}k` : `${symbol}${units.toFixed(units < 10 && units > 0 ? 2 : 0)}`;
  }
  if (metric === 'ctr') return `${(v * 100).toFixed(1)}%`;
  if (metric === 'roas') return `${v.toFixed(1)}x`;
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 10) / 10);
}

/** A "nice" axis maximum and step so gridlines land on round numbers. */
function niceScale(max: number): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 0.25 };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? rough;
  return { top: step * Math.ceil(max / step), step };
}

/** Split a series into runs of consecutive non-null points so gaps stay gaps. */
function segments(values: Array<number | null>): number[][] {
  const out: number[][] = [];
  let run: number[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) out.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) out.push(run);
  return out;
}

const H = 250;
const M = { top: 14, right: 14, bottom: 28, left: 50 };

export function TimeSeriesChart({ points, currency, showPrevious, initialMetric = 'spend' }: { points: ChartPoint[]; currency: string; showPrevious: boolean; initialMetric?: ChartMetric }) {
  const [metric, setMetric] = useState<ChartMetric>(initialMetric);
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(720);
  const wrapRef = useRef<HTMLDivElement>(null);
  const helpId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry!.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cur = useMemo(() => points.map((p) => p.current?.[metric] ?? null), [points, metric]);
  const prev = useMemo(() => points.map((p) => (showPrevious ? (p.previous?.[metric] ?? null) : null)), [points, metric, showPrevious]);
  const max = Math.max(0, ...cur.map((v) => v ?? 0), ...prev.map((v) => v ?? 0));
  const { top, step } = niceScale(max);
  const innerW = width - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const x = (i: number) => M.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => M.top + innerH - (v / top) * innerH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 76))));
  const path = (values: Array<number | null>, run: number[]) => run.map((i, n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)},${y(values[i]!).toFixed(1)}`).join('');
  const hasAny = cur.some((v) => v !== null);
  const label = METRICS.find((m) => m.id === metric)!.label;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!points.length) return;
    const last = points.length - 1;
    const next =
      e.key === 'ArrowRight' ? Math.min(last, (active ?? -1) + 1) : e.key === 'ArrowLeft' ? Math.max(0, (active ?? points.length) - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (e.key === 'Escape') setActive(null);
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  }

  const point = active === null ? null : points[active]!;
  const curV = active === null ? null : cur[active]!;
  const prevV = active === null ? null : prev[active]!;
  const tooltipLeft = active === null ? 0 : Math.min(Math.max(x(active), 96), width - 96);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="segmented" role="group" aria-label="Chart metric">
          {METRICS.map((m) => (
            <button key={m.id} type="button" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {showPrevious ? (
          <ul className="flex items-center gap-4 text-[0.8rem] text-ink-2" aria-label="Legend">
            <li className="flex items-center gap-1.5">
              <svg width="22" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="22" y2="3" stroke="var(--color-chart-1)" strokeWidth="2" />
              </svg>
              This period
            </li>
            <li className="flex items-center gap-1.5">
              <svg width="22" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="22" y2="3" stroke="var(--color-chart-2)" strokeWidth="2" strokeDasharray="4 3" />
              </svg>
              Previous period
            </li>
          </ul>
        ) : null}
      </div>

      <div
        ref={wrapRef}
        className="relative"
        tabIndex={0}
        role="group"
        aria-label={`Daily ${label} chart, ${points.length} days`}
        aria-describedby={helpId}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(e) => {
          if (!points.length) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left - M.left) / Math.max(1, innerW);
          setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
        }}
      >
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`Line chart of daily ${label}${showPrevious ? ' with the previous period for comparison' : ''}.`} className="block max-w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-ink-3)" className="num">
                {formatAxis(metric, t, currency)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={p.date} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : 'middle'} fontSize="11" fill="var(--color-ink-3)">
                {formatDate(p.date, { year: false })}
              </text>
            ) : null,
          )}
          {segments(prev).map((run) =>
            run.length === 1 ? (
              <circle key={`p${run[0]}`} cx={x(run[0]!)} cy={y(prev[run[0]!]!)} r="2" fill="var(--color-chart-2)" />
            ) : (
              <path key={`p${run[0]}`} d={path(prev, run)} fill="none" stroke="var(--color-chart-2)" strokeWidth="1.75" strokeDasharray="4 3" strokeLinejoin="round" />
            ),
          )}
          {segments(cur).map((run) =>
            run.length === 1 ? (
              <circle key={`c${run[0]}`} cx={x(run[0]!)} cy={y(cur[run[0]!]!)} r="2.5" fill="var(--color-chart-1)" />
            ) : (
              <path key={`c${run[0]}`} d={path(cur, run)} fill="none" stroke="var(--color-chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ),
          )}
          {active !== null ? (
            <g>
              <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + innerH} stroke="var(--color-ink-3)" strokeWidth="1" />
              {prevV !== null ? <circle cx={x(active)} cy={y(prevV)} r="4" fill="var(--color-chart-2)" stroke="var(--color-surface)" strokeWidth="2" /> : null}
              {curV !== null ? <circle cx={x(active)} cy={y(curV)} r="4.5" fill="var(--color-chart-1)" stroke="var(--color-surface)" strokeWidth="2" /> : null}
            </g>
          ) : null}
        </svg>

        {!hasAny ? <p className="muted absolute inset-0 flex items-center justify-center text-[0.9rem]">No {label.toLowerCase()} data for these dates.</p> : null}

        {point ? (
          <div
            className="pointer-events-none absolute top-1 z-10 w-44 -translate-x-1/2 rounded-[6px] border border-line-strong bg-surface px-2.5 py-2 text-[0.8rem] shadow-[var(--shadow-pop)]"
            style={{ left: tooltipLeft }}
          >
            <p className="font-semibold">{formatDate(point.date)}</p>
            <p className="num mt-1 flex justify-between gap-3">
              <span className="muted">{label}</span>
              <span className="font-semibold">{point.current ? formatValue(metric, curV, currency) : 'No data'}</span>
            </p>
            {showPrevious && point.previousDate ? (
              <>
                <p className="num flex justify-between gap-3">
                  <span className="muted">{formatDate(point.previousDate, { year: false })}</span>
                  <span>{point.previous ? formatValue(metric, prevV, currency) : 'No data'}</span>
                </p>
                <p className="num flex justify-between gap-3">
                  <span className="muted">Change</span>
                  <span>{formatChange(change(curV, prevV))}</span>
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {point
            ? `${formatDate(point.date)}: ${label} ${point.current ? formatValue(metric, curV, currency) : 'no data'}${
                showPrevious && point.previousDate ? `; previous period ${formatDate(point.previousDate)}: ${point.previous ? formatValue(metric, prevV, currency) : 'no data'}` : ''
              }.`
            : ''}
        </p>
      </div>

      <p id={helpId} className="muted mt-1 text-[0.78rem]">
        Hover, or focus the chart and use the arrow keys, to read daily values. Gaps mean no data was imported for that day.
      </p>

      <details className="mt-2 text-[0.85rem]">
        <summary className="link w-fit cursor-pointer">View this chart as a table</summary>
        <div className="table-wrap mt-2 max-h-72 overflow-y-auto rounded-[6px] border border-line">
          <table className="table">
            <caption className="sr-only">Daily {label}</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="r">
                  {label}
                </th>
                {showPrevious ? (
                  <>
                    <th scope="col">Previous date</th>
                    <th scope="col" className="r">
                      Previous {label}
                    </th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.date}>
                  <th scope="row" className="!bg-transparent !text-[0.86rem] !font-normal !normal-case !tracking-normal !text-ink">
                    {formatDate(p.date)}
                  </th>
                  <td className="r">{p.current ? formatValue(metric, cur[i]!, currency) : 'No data'}</td>
                  {showPrevious ? (
                    <>
                      <td>{p.previousDate ? formatDate(p.previousDate) : ''}</td>
                      <td className="r">{p.previous ? formatValue(metric, prev[i]!, currency) : 'No data'}</td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
