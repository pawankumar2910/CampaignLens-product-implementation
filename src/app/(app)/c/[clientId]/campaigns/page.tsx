import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDate } from '@/lib/analytics';
import { clientPage, one, rangePresets, type SearchParams } from '@/lib/page';
import { analyzeClient } from '@/lib/services/workspace';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { CampaignTable } from '@/components/workspace/campaign-table';
import { ContextBar } from '@/components/workspace/context-bar';

export const metadata: Metadata = { title: 'Campaigns' };

export default async function CampaignsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: SearchParams }) {
  const { data, range, rangeQuery } = await clientPage(params, searchParams);
  const base = `/c/${data.client.id}`;
  const channelParam = one((await searchParams).channel);
  const channel = channelParam && data.channels.includes(channelParam) ? channelParam : null;
  const a = analyzeClient(data, range, { channel });
  const flagCount = new Map<string, number>();
  for (const q of a.queue) {
    if (q.channel && q.campaign) {
      const k = JSON.stringify([q.channel, q.campaign]);
      flagCount.set(k, (flagCount.get(k) ?? 0) + 1);
    }
  }

  return (
    <>
      <PageHeader title="Campaigns" description={`${data.client.name} · every figure is calculated from the campaign-day rows for the selected period.`} />
      <ContextBar basePath={`${base}/campaigns`} range={range} presets={rangePresets(data)} dataThrough={data.bounds?.to ?? null} channels={data.channels} channel={channel} />
      {a.campaigns.length === 0 ? (
        <EmptyState
          title={data.bounds ? 'No campaigns in this period' : 'No campaign data yet'}
          action={
            data.bounds ? (
              <Link href={`${base}/campaigns`} className="btn btn-primary">
                Show the last 30 days with data
              </Link>
            ) : (
              <Link href={`${base}/imports/new`} className="btn btn-primary">
                Import a CSV
              </Link>
            )
          }
        >
          {data.bounds
            ? `Data runs from ${formatDate(data.bounds.from)} to ${formatDate(data.bounds.to)}${channel ? `, and the list is filtered to ${channel}` : ''}.`
            : 'Import a campaign export to see campaign-level results.'}
        </EmptyState>
      ) : (
        <CampaignTable
          rows={a.campaigns.map((c) => ({ key: c.key, channel: c.channel, campaign: c.campaign!, metrics: c.current, spendChange: c.comparison.spend, cpaChange: c.comparison.cpa, flags: flagCount.get(c.key) ?? 0 }))}
          currency={data.client.currency}
          basePath={base}
          rangeQuery={rangeQuery}
          showComparison={a.previousHasData}
        />
      )}
    </>
  );
}
