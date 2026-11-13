import type { Metadata } from 'next';
import Link from 'next/link';
import { formatCount, formatDate, formatMoney, formatRate, formatRoas, pluralize } from '@/lib/analytics';
import { can } from '@/lib/auth/permissions';
import { clientPage, one, rangePresets, toChartPoints, type SearchParams } from '@/lib/page';
import { analyzeClient } from '@/lib/services/workspace';
import { TimeSeriesChart } from '@/components/charts/time-series';
import { Delta, EmptyState, Notice, PageHeader } from '@/components/ui/primitives';
import { ContextBar } from '@/components/workspace/context-bar';
import { PacingCard } from '@/components/workspace/pacing';
import { QueueList } from '@/components/workspace/queue';

export const metadata: Metadata = { title: 'Overview' };

export default async function OverviewPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: SearchParams }) {
  const { actor, data, range, rangeQuery } = await clientPage(params, searchParams);
  const { client } = data;
  const base = `/c/${client.id}`;
  const channelParam = one((await searchParams).channel);
  const channel = channelParam && data.channels.includes(channelParam) ? channelParam : null;
  const canImport = can(actor.role, 'data:import');

  if (!data.bounds) {
    return (
      <>
        <PageHeader title={client.name} description={`${client.currency} · ${client.timezone}`} />
        <EmptyState
          title="No campaign data yet"
          action={
            canImport ? (
              <Link href={`${base}/imports/new`} className="btn btn-primary">
                Import a CSV
              </Link>
            ) : undefined
          }
        >
          {canImport
            ? 'Import a campaign export to see performance, budget pacing and items to investigate. You will map its columns and review any problems before anything is saved.'
            : 'Nothing has been imported for this client. Ask an analyst or owner to import campaign data.'}
        </EmptyState>
      </>
    );
  }

  const a = analyzeClient(data, range, { channel });
  const money = (c: number | null, whole = false) => formatMoney(c, client.currency, { whole });
  const compare = a.previousHasData;
  const cur = a.current;
  const prev = a.previous;
  const kpis = [
    { label: 'Spend', value: money(cur.spendCents, true), prev: money(prev.spendCents, true), delta: <Delta change={a.comparison.spend} /> },
    { label: 'Conversions', value: formatCount(cur.conversions), prev: formatCount(prev.conversions), delta: <Delta change={a.comparison.conversions} better="up" /> },
    { label: 'CPA', value: money(cur.cpaCents), prev: money(prev.cpaCents), delta: <Delta change={a.comparison.cpa} better="down" /> },
    { label: 'Reported revenue', value: money(cur.revenueCents, true), prev: money(prev.revenueCents, true), delta: <Delta change={a.comparison.revenue} better="up" /> },
    { label: 'ROAS', value: formatRoas(cur.roas), prev: formatRoas(prev.roas), delta: <Delta change={a.comparison.roas} better="up" /> },
    { label: 'CTR', value: formatRate(cur.ctr), prev: formatRate(prev.ctr), delta: <Delta change={a.comparison.ctr} better="up" points /> },
    { label: 'CPC', value: money(cur.cpcCents), prev: money(prev.cpcCents), delta: <Delta change={a.comparison.cpc} better="down" /> },
  ];
  const currentBudgets = a.pacing.filter((b) => b.pacing.phase !== 'complete');
  const budgetsShown = (currentBudgets.length ? currentBudgets : a.pacing).slice(0, 2);

  return (
    <>
      <PageHeader
        title={client.name}
        description={
          <>
            {client.currency} · reporting timezone {client.timezone}
            {channel ? ` · filtered to ${channel}` : ''}
          </>
        }
        actions={
          <>
            {canImport ? (
              <Link href={`${base}/imports/new`} className="btn">
                Import data
              </Link>
            ) : null}
            {can(actor.role, 'report:write') ? (
              <Link href={`${base}/reports${rangeQuery}`} className="btn btn-primary">
                Build report
              </Link>
            ) : null}
          </>
        }
      />
      <ContextBar basePath={base} range={range} presets={rangePresets(data)} dataThrough={data.bounds.to} channels={data.channels} channel={channel} />

      {cur.rows === 0 ? (
        <EmptyState
          title="No data for these dates"
          action={
            <Link href={base} className="btn btn-primary">
              Show the last 30 days with data
            </Link>
          }
        >
          Data for this client runs from {formatDate(data.bounds.from)} to {formatDate(data.bounds.to)}. An empty period means nothing was imported for it, not that nothing was spent.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {!a.coverage.complete ? (
            <Notice tone="warn" title={`Partial data: ${a.coverage.daysWithData} of ${pluralize(a.coverage.daysInRange, 'day')} have data`}>
              Days without data are treated as unknown, not zero, so totals may be understated.{' '}
              <Link className="link" href={`${base}/investigate${rangeQuery}`}>
                See what is missing
              </Link>
              .
            </Notice>
          ) : null}

          <section aria-labelledby="kpi-heading" className="panel">
            <div className="panel-head">
              <div>
                <h2 id="kpi-heading" className="panel-title">
                  What happened
                </h2>
                <p className="mt-0.5 text-[0.9rem]">{a.summary.headline}</p>
              </div>
              {!compare ? <span className="badge">No previous-period data to compare</span> : null}
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
              {kpis.map((k) => (
                <div key={k.label} className="border-b border-r border-line px-4 py-3.5 last:border-r-0 xl:border-b-0">
                  <dt className="eyebrow">{k.label}</dt>
                  <dd className="num mt-1 text-[1.3rem] font-semibold leading-tight">{k.value}</dd>
                  {compare ? (
                    <dd className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[0.78rem]">
                      {k.delta}
                      <span className="muted num">from {k.prev}</span>
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <section aria-labelledby="trend-heading" className="panel">
              <div className="panel-head">
                <h2 id="trend-heading" className="panel-title">
                  Daily trend
                </h2>
              </div>
              <div className="panel-body">
                <TimeSeriesChart points={toChartPoints(a)} currency={client.currency} showPrevious={compare} />
              </div>
            </section>

            <section aria-labelledby="queue-heading" className="panel self-start">
              <div className="panel-head">
                <h2 id="queue-heading" className="panel-title">
                  Needs investigation
                </h2>
                <span className="badge num">{pluralize(a.queue.length, 'item')}</span>
              </div>
              <QueueList items={a.queue} href={`${base}/investigate${rangeQuery}`} />
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <section aria-labelledby="say-heading" className="panel">
              <div className="panel-head">
                <h2 id="say-heading" className="panel-title">
                  What you can tell the client
                </h2>
                <span className="badge" title="Each sentence is a template filled with the figures on this page. No AI model is involved.">
                  Rule-based summary
                </span>
              </div>
              <div className="grid gap-x-8 gap-y-4 px-4 py-4 md:grid-cols-2">
                <div>
                  <h3 className="eyebrow !text-ok">The data supports</h3>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[0.9rem] marker:text-line-strong">
                    {a.summary.confident.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="eyebrow !text-warn">Say with a caveat</h3>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[0.9rem] marker:text-line-strong">
                    {a.summary.caveats.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section aria-labelledby="pacing-heading" className="panel self-start">
              <div className="panel-head">
                <h2 id="pacing-heading" className="panel-title">
                  Budget pacing
                </h2>
                <Link href={`${base}/pacing${rangeQuery}`} className="link text-[0.86rem]">
                  All budgets
                </Link>
              </div>
              {budgetsShown.length ? (
                <div className="divide-y divide-line">
                  {budgetsShown.map((b) => (
                    <div key={b.budgetId} className="px-4 py-3.5">
                      <PacingCard budget={b} currency={client.currency} tolerance={client.thresholds.pacingTolerancePct} compact />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted px-4 py-5 text-[0.9rem]">
                  No budget covers this period.{' '}
                  <Link href={`${base}/pacing${rangeQuery}`} className="link">
                    Add a budget
                  </Link>{' '}
                  to see observed, expected and projected spend.
                </p>
              )}
            </section>
          </div>

          <section aria-labelledby="channels-heading" className="panel">
            <div className="panel-head">
              <h2 id="channels-heading" className="panel-title">
                Channels
              </h2>
              <Link href={`${base}/campaigns${rangeQuery}`} className="link text-[0.86rem]">
                All campaigns
              </Link>
            </div>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Performance by channel for the selected period</caption>
                <thead>
                  <tr>
                    <th scope="col">Channel</th>
                    <th scope="col" className="min-w-[9rem]">
                      Share of spend
                    </th>
                    <th scope="col" className="r">
                      Spend
                    </th>
                    {compare ? (
                      <th scope="col" className="r">
                        vs previous
                      </th>
                    ) : null}
                    <th scope="col" className="r">
                      Conversions
                    </th>
                    <th scope="col" className="r">
                      CPA
                    </th>
                    <th scope="col" className="r">
                      ROAS
                    </th>
                    <th scope="col" className="r">
                      CTR
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {a.channels.map((c) => (
                    <tr key={c.key}>
                      <th scope="row" className="!bg-transparent !text-[0.86rem] !font-semibold !normal-case !tracking-normal !text-ink">
                        <Link className="hover:underline" href={`${base}/campaigns${rangeQuery}&channel=${encodeURIComponent(c.channel)}`}>
                          {c.channel}
                        </Link>
                      </th>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-sunken" aria-hidden="true">
                            <div className="h-full rounded-full bg-chart-1" style={{ width: `${((c.spendShare ?? 0) * 100).toFixed(1)}%` }} />
                          </div>
                          <span className="num w-10 text-right text-[0.8rem]">{formatRate(c.spendShare, 0)}</span>
                        </div>
                      </td>
                      <td className="r font-semibold">{money(c.current.spendCents)}</td>
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
            <p className="muted border-t border-line px-4 py-2.5 text-[0.78rem]">
              Conversions and revenue are as reported by each platform. Platforms use different attribution windows and can credit the same sale, so channel totals are not deduplicated.
              {client.conversionDefinition ? ` Conversion definition: ${client.conversionDefinition}` : ''}
            </p>
          </section>
        </div>
      )}
    </>
  );
}
