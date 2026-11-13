import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { campaignKey, formatCount, formatDate, formatInteger, formatMoney, formatRate, formatRoas, parseCampaignKey, summarize } from '@/lib/analytics';
import { clientPage, rangePresets, toChartPoints, type SearchParams } from '@/lib/page';
import { analyzeClient } from '@/lib/services/workspace';
import { TimeSeriesChart } from '@/components/charts/time-series';
import { Delta, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ContextBar } from '@/components/workspace/context-bar';
import { PacingCard } from '@/components/workspace/pacing';
import { QueueItem } from '@/components/workspace/queue';

export const metadata: Metadata = { title: 'Campaign detail' };

export default async function CampaignDetailPage({ params, searchParams }: { params: Promise<{ clientId: string; key: string }>; searchParams: SearchParams }) {
  const { key: rawKey } = await params;
  const { data, range, rangeQuery } = await clientPage(params, searchParams);
  const parsed = parseCampaignKey(decodeURIComponent(rawKey));
  if (!parsed) notFound();
  const key = campaignKey(parsed.channel, parsed.campaign);
  const allRows = data.rows.filter((r) => r.channel === parsed.channel && r.campaign === parsed.campaign);
  if (!allRows.length) notFound();

  const { client } = data;
  const base = `/c/${client.id}`;
  const a = analyzeClient(data, range, { campaignKey: key });
  const money = (c: number | null) => formatMoney(c, client.currency);
  const cur = a.current;
  const prev = a.previous;
  const compare = a.previousHasData;
  const days = a.series.filter((p) => p.metrics !== null);
  const items = a.queue.filter((q) => q.channel === parsed.channel && q.campaign === parsed.campaign);
  const budgets = a.pacing.filter((b) => b.scope === 'campaign' && b.channel === parsed.channel && b.campaign === parsed.campaign);
  const lifetime = summarize(allRows);

  const kpis = [
    { label: 'Spend', value: money(cur.spendCents), prev: money(prev.spendCents), delta: <Delta change={a.comparison.spend} /> },
    { label: 'Impressions', value: formatInteger(cur.impressions), prev: formatInteger(prev.impressions), delta: <Delta change={a.comparison.impressions} /> },
    { label: 'Clicks', value: formatInteger(cur.clicks), prev: formatInteger(prev.clicks), delta: <Delta change={a.comparison.clicks} better="up" /> },
    { label: 'CTR', value: formatRate(cur.ctr), prev: formatRate(prev.ctr), delta: <Delta change={a.comparison.ctr} better="up" points /> },
    { label: 'CPC', value: money(cur.cpcCents), prev: money(prev.cpcCents), delta: <Delta change={a.comparison.cpc} better="down" /> },
    { label: 'Conversions', value: formatCount(cur.conversions), prev: formatCount(prev.conversions), delta: <Delta change={a.comparison.conversions} better="up" /> },
    { label: 'CPA', value: money(cur.cpaCents), prev: money(prev.cpaCents), delta: <Delta change={a.comparison.cpa} better="down" /> },
    { label: 'ROAS', value: formatRoas(cur.roas), prev: formatRoas(prev.roas), delta: <Delta change={a.comparison.roas} better="up" /> },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="muted mb-2 text-[0.84rem]">
        <Link href={`${base}/campaigns${rangeQuery}`} className="link">
          Campaigns
        </Link>{' '}
        / {parsed.channel}
      </nav>
      <PageHeader
        title={parsed.campaign}
        description={`${parsed.channel} · ${client.name} · data from ${formatDate(allRows[0]!.date)} to ${formatDate(allRows.at(-1)!.date)} (${formatInteger(lifetime.rows)} days, ${money(lifetime.spendCents)} total spend)`}
      />
      <ContextBar basePath={`${base}/campaigns/${encodeURIComponent(key)}`} range={range} presets={rangePresets(data)} dataThrough={data.bounds?.to ?? null} />

      {cur.rows === 0 ? (
        <EmptyState
          title="This campaign has no data in the selected period"
          action={
            <Link href={`${base}/campaigns/${encodeURIComponent(key)}?from=${allRows.at(-1)!.date.slice(0, 8)}01&to=${allRows.at(-1)!.date}`} className="btn btn-primary">
              Jump to its latest data
            </Link>
          }
        >
          Its rows run from {formatDate(allRows[0]!.date)} to {formatDate(allRows.at(-1)!.date)}. No rows can mean the campaign was paused or that the export for these dates was not imported.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="c-kpis" className="panel">
            <div className="panel-head">
              <h2 id="c-kpis" className="panel-title">
                Totals for the period
              </h2>
              {!compare ? <span className="badge">No previous-period data to compare</span> : null}
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
              {kpis.map((k) => (
                <div key={k.label} className="border-b border-r border-line px-4 py-3 last:border-r-0 xl:border-b-0">
                  <dt className="eyebrow">{k.label}</dt>
                  <dd className="num mt-1 text-[1.1rem] font-semibold leading-tight">{k.value}</dd>
                  {compare ? (
                    <dd className="mt-1 text-[0.76rem]">
                      {k.delta} <span className="muted num block">from {k.prev}</span>
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </section>

          {items.length ? (
            <section aria-labelledby="c-flags" className="space-y-3">
              <h2 id="c-flags" className="panel-title">
                Items to investigate for this campaign
              </h2>
              {items.map((item) => (
                <QueueItem key={item.id} item={item} />
              ))}
            </section>
          ) : null}

          <section aria-labelledby="c-trend" className="panel">
            <div className="panel-head">
              <h2 id="c-trend" className="panel-title">
                Daily trend
              </h2>
            </div>
            <div className="panel-body">
              <TimeSeriesChart points={toChartPoints(a)} currency={client.currency} showPrevious={compare} />
            </div>
          </section>

          {budgets.map((b) => (
            <PacingCard key={b.budgetId} budget={b} currency={client.currency} tolerance={client.thresholds.pacingTolerancePct} />
          ))}

          <section aria-labelledby="c-inputs" className="panel">
            <div className="panel-head">
              <div>
                <h2 id="c-inputs" className="panel-title">
                  Underlying inputs
                </h2>
                <p className="muted mt-0.5 text-[0.84rem]">
                  The imported row for each day, {a.coverage.daysWithData} of {a.coverage.daysInRange} days in the period. Ratios in the totals row are calculated from the summed columns.
                </p>
              </div>
            </div>
            <div className="table-wrap max-h-[32rem] overflow-y-auto">
              <table className="table">
                <caption className="sr-only">Daily imported values for this campaign</caption>
                <thead className="sticky top-0">
                  <tr>
                    <th scope="col">Date</th>
                    {['Spend', 'Impressions', 'Clicks', 'Conversions', 'Revenue', 'CTR', 'CPC', 'CPA', 'ROAS'].map((h) => (
                      <th key={h} scope="col" className="r">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((p) => {
                    const m = p.metrics!;
                    return (
                      <tr key={p.date}>
                        <th scope="row" className="!bg-transparent !text-[0.86rem] !font-normal !normal-case !tracking-normal !text-ink">
                          {formatDate(p.date)}
                        </th>
                        <td className="r">{money(m.spendCents)}</td>
                        <td className="r">{formatInteger(m.impressions)}</td>
                        <td className="r">{formatInteger(m.clicks)}</td>
                        <td className="r">{formatCount(m.conversions)}</td>
                        <td className="r">{money(m.revenueCents)}</td>
                        <td className="r">{formatRate(m.ctr)}</td>
                        <td className="r">{money(m.cpcCents)}</td>
                        <td className="r">{money(m.cpaCents)}</td>
                        <td className="r">{formatRoas(m.roas)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="r">{money(cur.spendCents)}</td>
                    <td className="r">{formatInteger(cur.impressions)}</td>
                    <td className="r">{formatInteger(cur.clicks)}</td>
                    <td className="r">{formatCount(cur.conversions)}</td>
                    <td className="r">{money(cur.revenueCents)}</td>
                    <td className="r">{formatRate(cur.ctr)}</td>
                    <td className="r">{money(cur.cpcCents)}</td>
                    <td className="r">{money(cur.cpaCents)}</td>
                    <td className="r">{formatRoas(cur.roas)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
