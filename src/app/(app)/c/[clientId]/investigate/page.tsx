import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDate, formatMoney, pluralize } from '@/lib/analytics';
import { clientPage, rangePresets, type SearchParams } from '@/lib/page';
import { analyzeClient } from '@/lib/services/workspace';
import { EmptyState, Notice, PageHeader } from '@/components/ui/primitives';
import { ContextBar } from '@/components/workspace/context-bar';
import { QueueItem } from '@/components/workspace/queue';

export const metadata: Metadata = { title: 'Investigate' };

export default async function InvestigatePage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: SearchParams }) {
  const { data, range, rangeQuery } = await clientPage(params, searchParams);
  const { client } = data;
  const base = `/c/${client.id}`;
  const a = analyzeClient(data, range);
  const t = client.thresholds;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const counts = { high: 0, medium: 0, low: 0 };
  for (const q of a.queue) counts[q.priority]++;

  return (
    <>
      <PageHeader
        title="Investigate"
        description="Rule-based observations that deserve a look before the client review. Each one shows the rule, the numbers and a next check. They are prompts for investigation, not diagnoses."
      />
      <ContextBar basePath={`${base}/investigate`} range={range} presets={rangePresets(data)} dataThrough={data.bounds?.to ?? null} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-3">
          {!data.bounds ? (
            <EmptyState
              title="Nothing to investigate yet"
              action={
                <Link href={`${base}/imports/new`} className="btn btn-primary">
                  Import a CSV
                </Link>
              }
            >
              The queue is built from imported campaign data.
            </EmptyState>
          ) : a.queue.length === 0 ? (
            <EmptyState
              title="No rules were triggered for this period"
              action={
                <Link href={`${base}/settings`} className="btn">
                  Review thresholds
                </Link>
              }
            >
              That means no campaign crossed the current thresholds with enough volume. It is not proof that nothing changed.
            </EmptyState>
          ) : (
            <>
              <p className="text-[0.9rem]" role="status">
                <strong>{pluralize(a.queue.length, 'item')}</strong>: {counts.high} high, {counts.medium} medium, {counts.low} low priority.
              </p>
              {a.queue.map((item) => (
                <QueueItem key={item.id} item={item} clientPath={base} rangeQuery={rangeQuery} />
              ))}
            </>
          )}
        </div>

        <aside className="space-y-4 self-start">
          <section className="panel" aria-labelledby="inv-coverage">
            <div className="panel-head">
              <h2 id="inv-coverage" className="panel-title">
                Data coverage
              </h2>
              <span className={`badge ${a.coverage.complete ? 'badge-ok' : 'badge-warn'}`}>{a.coverage.complete ? 'Complete' : 'Partial'}</span>
            </div>
            <dl className="space-y-2 px-4 py-3 text-[0.86rem]">
              <div className="flex justify-between gap-3">
                <dt className="muted">This period</dt>
                <dd className="num">
                  {a.coverage.daysWithData} of {a.coverage.daysInRange} days
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="muted">Previous period</dt>
                <dd className="num">
                  {a.previousCoverage.daysWithData} of {a.previousCoverage.daysInRange} days
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="muted">Data imported through</dt>
                <dd className="num">{data.bounds ? formatDate(data.bounds.to) : 'None'}</dd>
              </div>
            </dl>
            <p className="muted border-t border-line px-4 py-2.5 text-[0.78rem]">
              A day with no rows is unknown, not zero. See{' '}
              <Link href={`${base}/imports`} className="link">
                import history
              </Link>{' '}
              for sources.
            </p>
          </section>

          <section className="panel" aria-labelledby="inv-rules">
            <div className="panel-head">
              <h2 id="inv-rules" className="panel-title">
                Rules in use
              </h2>
              <Link href={`${base}/settings`} className="link text-[0.84rem]">
                Change
              </Link>
            </div>
            <ul className="space-y-2 px-4 py-3 text-[0.84rem]">
              <li>Spend change of {pct(t.spendChangePct)} or more against the previous period.</li>
              <li>
                CPA increase of {pct(t.cpaIncreasePct)} or more, with at least {t.minConversions} conversions in each period.
              </li>
              <li>
                Campaigns are evaluated once they spend {formatMoney(t.minSpendCents, client.currency)} in a period; fewer than {t.minConversions} conversions is marked low volume.
              </li>
              <li>Budget projection off by {pct(t.pacingTolerancePct)} or more.</li>
              <li>Any channel with missing days inside the period.</li>
            </ul>
          </section>

          <Notice>
            Flags compare numbers; they cannot see why something changed. Confirm in the ad platform before telling the client a cause, and do not move budget on ROAS alone.
          </Notice>
        </aside>
      </div>
    </>
  );
}
