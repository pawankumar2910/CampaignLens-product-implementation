import { daysInclusive, formatCount, formatDate, formatDateRange, formatMoney, formatRate, formatRoas, KIND_LABEL, METHOD_NOTES, pluralize, type Analysis } from '@/lib/analytics';
import { formatTimestamp } from '@/lib/format-time';
import type { ReportSectionId, ReportSnapshot } from '@/lib/reports/snapshot';
import { axisLabel, currencySymbol, trendGeometry } from '@/lib/reports/trend';
import { Delta } from '@/components/ui/primitives';
import { PacingCard } from '@/components/workspace/pacing';

/**
 * The client-facing report. It renders only from the stored snapshot, so the
 * workspace preview, the shared link and the PDF all show the same figures.
 * It has no data access and no interactive controls.
 */
export interface ReportDocumentProps {
  title: string;
  commentary: string;
  sections: string[];
  snapshot: ReportSnapshot;
  status: 'draft' | 'final';
  finalizedAt: string | null;
}

function TrendFigure({ title, values, previous, dates, format, showPrevious }: { title: string; values: Array<number | null>; previous: Array<number | null>; dates: string[]; format: (v: number) => string; showPrevious: boolean }) {
  const g = trendGeometry(values, showPrevious ? previous : previous.map(() => null), { width: 420, height: 170 });
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-[0.86rem] font-semibold">{title}</figcaption>
      <svg viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-label={`${title}, daily, for the report period${showPrevious ? ' with the previous period as a dashed line' : ''}. Figures are in the tables of this report.`} className="h-auto w-full">
        {g.yTicks.map((t) => (
          <g key={t.value}>
            <line x1={g.plot.left} x2={g.plot.right} y1={t.y} y2={t.y} stroke="var(--color-line)" strokeWidth="1" />
            <text x={g.plot.left - 6} y={t.y} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--color-ink-3)">
              {format(t.value)}
            </text>
          </g>
        ))}
        {g.xLabels.map((l) => (
          <text key={l.index} x={l.x} y={g.height - 5} textAnchor={l.anchor} fontSize="10" fill="var(--color-ink-3)">
            {formatDate(dates[l.index]!, { year: false })}
          </text>
        ))}
        {g.previous.map((d) => (
          <path key={d} d={d} fill="none" stroke="var(--color-chart-2)" strokeWidth="1.5" strokeDasharray="4 3" />
        ))}
        {g.previousDots.map((p) => (
          <circle key={`${p.x}`} cx={p.x} cy={p.y} r="1.8" fill="var(--color-chart-2)" />
        ))}
        {g.current.map((d) => (
          <path key={d} d={d} fill="none" stroke="var(--color-chart-1)" strokeWidth="2" strokeLinejoin="round" />
        ))}
        {g.currentDots.map((p) => (
          <circle key={`${p.x}`} cx={p.x} cy={p.y} r="2.2" fill="var(--color-chart-1)" />
        ))}
      </svg>
    </figure>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`r-${id}`} className="report-section border-t border-line px-6 py-5 sm:px-9">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`r-${id}`} className="display text-[1.2rem]">
          {title}
        </h2>
        {note ? <span className="muted text-[0.78rem]">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function ReportDocument({ title, commentary, sections, snapshot, status, finalizedAt }: ReportDocumentProps) {
  const a: Analysis = snapshot.analysis;
  const { client } = snapshot;
  const has = (id: ReportSectionId) => sections.includes(id);
  const money = (c: number | null, whole = false) => formatMoney(c, client.currency, { whole });
  const compare = a.previousHasData;
  const days = daysInclusive(a.range.from, a.range.to);
  const dates = a.series.map((p) => p.date);
  const symbol = currencySymbol(client.currency);
  const paragraphs = commentary.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const kpis = [
    { label: 'Spend', value: money(a.current.spendCents), prev: money(a.previous.spendCents), delta: <Delta change={a.comparison.spend} /> },
    { label: 'Conversions', value: formatCount(a.current.conversions), prev: formatCount(a.previous.conversions), delta: <Delta change={a.comparison.conversions} better="up" /> },
    { label: 'Cost per acquisition', value: money(a.current.cpaCents), prev: money(a.previous.cpaCents), delta: <Delta change={a.comparison.cpa} better="down" /> },
    { label: 'Reported revenue', value: money(a.current.revenueCents), prev: money(a.previous.revenueCents), delta: <Delta change={a.comparison.revenue} better="up" /> },
    { label: 'ROAS', value: formatRoas(a.current.roas), prev: formatRoas(a.previous.roas), delta: <Delta change={a.comparison.roas} better="up" /> },
    { label: 'Click-through rate', value: formatRate(a.current.ctr), prev: formatRate(a.previous.ctr), delta: <Delta change={a.comparison.ctr} better="up" points /> },
    { label: 'Cost per click', value: money(a.current.cpcCents), prev: money(a.previous.cpcCents), delta: <Delta change={a.comparison.cpc} better="down" /> },
  ];

  return (
    <article className="report panel overflow-hidden" aria-label={`Report: ${title}`}>
      <header className="px-6 pb-5 pt-6 sm:px-9" style={{ borderTop: `6px solid ${client.branding.color}` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="eyebrow" style={{ color: client.branding.color }}>
            {client.name}
          </p>
          {status === 'draft' ? <span className="badge badge-warn">Draft, not final</span> : null}
        </div>
        <h1 className="display mt-2 text-[1.9rem] [overflow-wrap:anywhere]">{title}</h1>
        <p className="mt-2 text-[0.95rem]">
          {formatDateRange(a.range.from, a.range.to)} · {pluralize(days, 'day')}
          {compare ? ` · compared with ${formatDateRange(a.previousRange.from, a.previousRange.to)}` : ''}
        </p>
        <p className="muted mt-1 text-[0.84rem]">
          {client.branding.preparedBy ? `Prepared by ${client.branding.preparedBy}. ` : ''}
          Amounts in {client.currency}. Dates are calendar days in {client.timezone}. {status === 'final' && finalizedAt ? `Finalized ${formatTimestamp(finalizedAt)}.` : `Data captured ${formatTimestamp(snapshot.generatedAt)}.`}
        </p>
      </header>

      {a.current.rows === 0 ? (
        <Section id="empty" title="No data for this period">
          <p className="text-[0.92rem]">No campaign data had been imported for these dates when this report was created. That means the data is missing, not that nothing was spent.</p>
        </Section>
      ) : (
        <>
          {has('summary') ? (
            <Section id="summary" title="Summary" note="Rule-based, generated from the figures in this report">
              <p className="text-[1rem] font-semibold">{a.summary.headline}</p>
              <div className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-2">
                <div>
                  <h3 className="eyebrow">What the data shows</h3>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[0.9rem] marker:text-line-strong">
                    {a.summary.confident.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="eyebrow">Context for these figures</h3>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[0.9rem] marker:text-line-strong">
                    {a.summary.caveats.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Section>
          ) : null}

          {paragraphs.length ? (
            <Section id="commentary" title="Commentary" note={client.branding.preparedBy ? `From ${client.branding.preparedBy}` : undefined}>
              <div className="max-w-3xl space-y-2.5 text-[0.95rem]">
                {paragraphs.map((p, i) => (
                  <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">
                    {p}
                  </p>
                ))}
              </div>
            </Section>
          ) : null}

          {has('kpis') ? (
            <Section id="kpis" title="Key metrics" note={compare ? `Change is against the previous ${pluralize(days, 'day')}` : 'No previous-period data to compare'}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                {kpis.map((k) => (
                  <div key={k.label} className="report-keep">
                    <dt className="eyebrow">{k.label}</dt>
                    <dd className="num mt-0.5 text-[1.3rem] font-semibold leading-tight">{k.value}</dd>
                    {compare ? (
                      <dd className="mt-0.5 text-[0.78rem]">
                        {k.delta} <span className="muted num">from {k.prev}</span>
                      </dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            </Section>
          ) : null}

          {has('trend') ? (
            <Section id="trend" title="Daily trend" note={compare ? 'Solid line: this period. Dashed line: previous period.' : undefined}>
              <div className="report-keep grid gap-6 md:grid-cols-2">
                <TrendFigure title={`Spend (${client.currency})`} values={a.series.map((p) => (p.metrics ? p.metrics.spendCents / 100 : null))} previous={a.previousSeries.map((p) => (p.metrics ? p.metrics.spendCents / 100 : null))} dates={dates} format={(v) => axisLabel(v, symbol)} showPrevious={compare} />
                <TrendFigure title="Conversions" values={a.series.map((p) => p.metrics?.conversions ?? null)} previous={a.previousSeries.map((p) => p.metrics?.conversions ?? null)} dates={dates} format={(v) => axisLabel(v)} showPrevious={compare} />
              </div>
              {!a.coverage.complete ? <p className="muted mt-2 text-[0.8rem]">Gaps in a line are days with no imported data.</p> : null}
            </Section>
          ) : null}

          {has('channels') ? (
            <Section id="channels" title="Channels">
              <div className="table-wrap rounded-[6px] border border-line">
                <table className="table">
                  <caption className="sr-only">Performance by channel</caption>
                  <thead>
                    <tr>
                      <th scope="col">Channel</th>
                      {['Spend', 'Share', 'Conversions', 'CPA', 'Revenue', 'ROAS', 'CTR'].map((h) => (
                        <th key={h} scope="col" className="r">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {a.channels.map((c) => (
                      <tr key={c.key}>
                        <th scope="row" className="!bg-transparent !text-[0.86rem] !font-semibold !normal-case !tracking-normal !text-ink">
                          {c.channel}
                        </th>
                        <td className="r">{money(c.current.spendCents)}</td>
                        <td className="r">{formatRate(c.spendShare, 0)}</td>
                        <td className="r">{formatCount(c.current.conversions)}</td>
                        <td className="r">{money(c.current.cpaCents)}</td>
                        <td className="r">{money(c.current.revenueCents)}</td>
                        <td className="r">{formatRoas(c.current.roas)}</td>
                        <td className="r">{formatRate(c.current.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="r">{money(a.current.spendCents)}</td>
                      <td className="r">100%</td>
                      <td className="r">{formatCount(a.current.conversions)}</td>
                      <td className="r">{money(a.current.cpaCents)}</td>
                      <td className="r">{money(a.current.revenueCents)}</td>
                      <td className="r">{formatRoas(a.current.roas)}</td>
                      <td className="r">{formatRate(a.current.ctr)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Section>
          ) : null}

          {has('campaigns') ? (
            <Section id="campaigns" title="Campaigns" note={`${pluralize(a.campaigns.length, 'campaign')}, by spend`}>
              <div className="table-wrap rounded-[6px] border border-line">
                <table className="table">
                  <caption className="sr-only">Performance by campaign</caption>
                  <thead>
                    <tr>
                      <th scope="col">Campaign</th>
                      {['Spend', ...(compare ? ['vs previous'] : []), 'Conversions', 'CPA', 'ROAS', 'CTR'].map((h) => (
                        <th key={h} scope="col" className="r">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {a.campaigns.map((c) => (
                      <tr key={c.key}>
                        <th scope="row" className="!bg-transparent !text-[0.86rem] !font-normal !normal-case !tracking-normal !text-ink !whitespace-normal">
                          <span className="font-semibold [overflow-wrap:anywhere]">{c.campaign}</span>
                          <span className="muted block text-[0.78rem]">{c.channel}</span>
                        </th>
                        <td className="r">{money(c.current.spendCents)}</td>
                        {compare ? (
                          <td className="r">
                            <Delta change={c.comparison.spend} />
                          </td>
                        ) : null}
                        <td className="r">{formatCount(c.current.conversions)}</td>
                        <td className="r">{money(c.current.cpaCents)}</td>
                        <td className="r">{formatRoas(c.current.roas)}</td>
                        <td className="r">{formatRate(c.current.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {has('pacing') && a.pacing.length ? (
            <Section id="pacing" title="Budget pacing">
              <div className="grid gap-4 md:grid-cols-2">
                {a.pacing.map((b) => (
                  <div key={b.budgetId} className="report-keep rounded-[6px] border border-line p-3.5">
                    <PacingCard budget={b} currency={client.currency} tolerance={snapshot.thresholds.pacingTolerancePct} compact />
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {has('review') && a.queue.length ? (
            <Section id="review" title="Items under review" note="Observations we are checking, not conclusions">
              <ul className="space-y-3">
                {a.queue.map((q) => (
                  <li key={q.id} className="report-keep rounded-[6px] border border-line px-3.5 py-3 text-[0.9rem]">
                    <p className="font-semibold [overflow-wrap:anywhere]">
                      <span className="muted font-normal">{KIND_LABEL[q.kind]}: </span>
                      {q.title}
                    </p>
                    <p className="num muted mt-1 text-[0.84rem]">
                      {q.evidence.map((e) => `${e.label} ${e.current}${e.previous ? ` (previously ${e.previous}${e.change ? `, ${e.change}` : ''})` : ''}`).join(' · ')}
                    </p>
                    <p className="mt-1.5 text-[0.86rem]">
                      <span className="font-semibold">Next check: </span>
                      {q.nextCheck}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {has('method') ? (
            <Section id="method" title="Method and data notes">
              <div className="grid gap-x-8 gap-y-4 text-[0.84rem] md:grid-cols-2">
                <div>
                  <h3 className="eyebrow">How figures are calculated</h3>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 marker:text-line-strong">
                    {METHOD_NOTES.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-3">
                  <div>
                    <h3 className="eyebrow">Data in this report</h3>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 marker:text-line-strong">
                      <li>
                        {formatCount(snapshot.provenance.rowCount)} campaign-day rows covering {a.coverage.daysWithData} of {pluralize(a.coverage.daysInRange, 'day')}
                        {a.coverage.channelGaps.length ? `; days are missing for ${a.coverage.channelGaps.map((g) => `${g.channel} (${g.missingDates.length})`).join(', ')}` : ''}.
                      </li>
                      {client.conversionDefinition ? <li>Conversion definition: {client.conversionDefinition}</li> : null}
                      <li>Data captured {formatTimestamp(snapshot.generatedAt)}. Later imports do not change this report.</li>
                    </ul>
                  </div>
                  {snapshot.provenance.imports.length ? (
                    <div>
                      <h3 className="eyebrow">Sources</h3>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 marker:text-line-strong">
                        {snapshot.provenance.imports.map((i) => (
                          <li key={`${i.fileName}${i.importedAt}`} className="[overflow-wrap:anywhere]">
                            {i.source} ({i.fileName}), imported {formatTimestamp(i.importedAt)}
                            {i.coverageStart && i.coverageEnd ? `, covering ${formatDateRange(i.coverageStart, i.coverageEnd)}` : ''}.
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </Section>
          ) : null}
        </>
      )}

      <footer className="muted border-t border-line px-6 py-3.5 text-[0.78rem] sm:px-9">
        {client.branding.footer ? <p className="[overflow-wrap:anywhere]">{client.branding.footer}</p> : null}
        <p>
          {snapshot.agencyName} · {client.name} · {formatDateRange(a.range.from, a.range.to)}
        </p>
      </footer>
    </article>
  );
}
