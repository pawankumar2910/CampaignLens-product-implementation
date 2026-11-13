import { formatDate, formatDateRange, formatMoney, formatRate, pluralize, type BudgetPacing } from '@/lib/analytics';

type PaceStatus = { label: string; badge: string; mark: string };

export function paceStatus(b: BudgetPacing, tolerance: number): PaceStatus {
  const p = b.pacing;
  if (p.phase === 'not_started') return { label: 'Not started', badge: '', mark: '○' };
  const variance = p.phase === 'complete' ? (p.spendCents - p.budgetCents) / p.budgetCents : (p.projectedVariance ?? 0);
  const done = p.phase === 'complete';
  if (variance >= tolerance) return { label: done ? 'Finished over budget' : 'Projected over budget', badge: 'badge-danger', mark: '▲' };
  if (variance <= -tolerance) return { label: done ? 'Finished under budget' : 'Projected under budget', badge: 'badge-warn', mark: '▼' };
  return { label: done ? 'Finished within tolerance' : 'On pace', badge: 'badge-ok', mark: '●' };
}

/**
 * One budget's pacing: a bar for observed spend, a tick for where even pacing
 * would be today, and the four numbers spelled out underneath.
 */
export function PacingCard({ budget, currency, tolerance, compact }: { budget: BudgetPacing; currency: string; tolerance: number; compact?: boolean }) {
  const p = budget.pacing;
  const money = (c: number | null) => formatMoney(c, currency);
  const status = paceStatus(budget, tolerance);
  const scale = Math.max(p.budgetCents, p.spendCents, p.projectedCents ?? 0) || 1;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100).toFixed(2)}%`;
  return (
    <div className={compact ? '' : 'panel p-4'}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[0.92rem] font-semibold [overflow-wrap:anywhere]">{budget.label}</h3>
        <span className={`badge ${status.badge}`}>
          <span aria-hidden="true" className="text-[0.6rem]">
            {status.mark}
          </span>
          {status.label}
        </span>
      </div>
      <p className="muted mt-0.5 text-[0.8rem]">
        {formatDateRange(p.period.from, p.period.to)} · {p.phase === 'not_started' ? 'starts later' : `day ${p.elapsedDays} of ${p.totalDays}, as of ${formatDate(p.asOf, { year: false })}`}
      </p>

      <div
        className="relative mt-3 h-3 rounded-full bg-sunken"
        role="img"
        aria-label={`${money(p.spendCents)} spent of ${money(p.budgetCents)} budget, ${formatRate(p.usedRatio, 0)} used. Expected by now with even pacing: ${money(p.expectedCents)}.`}
      >
        <div className="h-full rounded-full bg-chart-1" style={{ width: pct(p.spendCents) }} />
        {p.phase === 'in_progress' ? <div className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: pct(p.expectedCents) }} title="Expected by now with even pacing" /> : null}
        <div className="absolute -top-1 h-5 w-px border-l border-dashed border-ink-3" style={{ left: pct(p.budgetCents) }} title="Budget" />
      </div>
      <p className="muted mt-1 text-[0.74rem]">Bar: observed spend. Solid tick: expected by now. Dashed tick: budget.</p>

      <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.86rem] sm:grid-cols-4">
        <div>
          <dt className="muted text-[0.76rem]">Observed spend</dt>
          <dd className="font-semibold">{money(p.spendCents)}</dd>
        </div>
        <div>
          <dt className="muted text-[0.76rem]">Expected by now</dt>
          <dd className="font-semibold">{money(p.expectedCents)}</dd>
        </div>
        <div>
          <dt className="muted text-[0.76rem]">{p.remainingCents >= 0 ? 'Remaining budget' : 'Over budget by'}</dt>
          <dd className="font-semibold">{money(Math.abs(p.remainingCents))}</dd>
        </div>
        <div>
          <dt className="muted text-[0.76rem]">{p.phase === 'complete' ? 'Final spend' : 'Linear projection'}</dt>
          <dd className="font-semibold">
            {money(p.projectedCents)}
            {p.projectedVariance !== null && p.phase === 'in_progress' ? <span className="muted font-normal"> ({p.projectedVariance >= 0 ? '+' : '−'}{formatRate(Math.abs(p.projectedVariance), 0)} vs budget)</span> : null}
          </dd>
        </div>
      </dl>
      {p.phase === 'in_progress' ? (
        <p className="muted mt-2 text-[0.78rem]">
          The projection is linear: average daily spend so far, continued for the remaining {pluralize(p.remainingDays, 'day')}. It is not a forecast.
          {budget.elapsedDaysWithoutData > 0 ? ` ${pluralize(budget.elapsedDaysWithoutData, 'elapsed day')} have no imported data, so observed spend may be understated.` : ''}
        </p>
      ) : null}
    </div>
  );
}
