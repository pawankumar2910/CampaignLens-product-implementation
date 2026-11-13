'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatCount, formatInteger, formatMoney, formatRate, formatRoas, toMetrics, type Change, type Metrics, type Totals } from '@/lib/analytics';
import { IconArrowDown, IconArrowUp, IconSearch, IconSort } from '@/components/ui/icons';
import { Delta } from '@/components/ui/primitives';

export interface CampaignTableRow {
  key: string;
  channel: string;
  campaign: string;
  metrics: Metrics;
  spendChange: Change;
  cpaChange: Change;
  flags: number;
}

type SortKey = 'campaign' | 'spend' | 'spendChange' | 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'conversions' | 'cpa' | 'revenue' | 'roas';

const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean; title?: string }> = [
  { key: 'campaign', label: 'Campaign', numeric: false },
  { key: 'spend', label: 'Spend', numeric: true },
  { key: 'spendChange', label: 'vs prev', numeric: true, title: 'Spend change against the previous period' },
  { key: 'impressions', label: 'Impr.', numeric: true, title: 'Impressions' },
  { key: 'clicks', label: 'Clicks', numeric: true },
  { key: 'ctr', label: 'CTR', numeric: true, title: 'Clicks / impressions' },
  { key: 'cpc', label: 'CPC', numeric: true, title: 'Spend / clicks' },
  { key: 'conversions', label: 'Conv.', numeric: true, title: 'Platform-reported conversions' },
  { key: 'cpa', label: 'CPA', numeric: true, title: 'Spend / conversions' },
  { key: 'revenue', label: 'Revenue', numeric: true, title: 'Platform-reported revenue' },
  { key: 'roas', label: 'ROAS', numeric: true, title: 'Reported revenue / spend' },
];

/** Unavailable values (N/A) always sort last, whichever direction is chosen. */
function sortValue(row: CampaignTableRow, key: SortKey): number | string | null {
  const m = row.metrics;
  switch (key) {
    case 'campaign': return `${row.campaign} ${row.channel}`.toLowerCase();
    case 'spend': return m.spendCents;
    case 'spendChange': return row.spendChange.pct;
    case 'impressions': return m.impressions;
    case 'clicks': return m.clicks;
    case 'ctr': return m.ctr;
    case 'cpc': return m.cpcCents;
    case 'conversions': return m.conversions;
    case 'cpa': return m.cpaCents;
    case 'revenue': return m.revenueCents;
    case 'roas': return m.roas;
  }
}

export function CampaignTable({ rows, currency, basePath, rangeQuery, showComparison }: { rows: CampaignTableRow[]; currency: string; basePath: string; rangeQuery: string; showComparison: boolean }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'spend', dir: 'desc' });
  const money = (c: number | null) => formatMoney(c, currency);
  const columns = COLUMNS.filter((c) => showComparison || c.key !== 'spendChange');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.campaign.toLowerCase().includes(q) || r.channel.toLowerCase().includes(q)) : rows;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va === null && vb === null) return a.key.localeCompare(b.key);
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
      return cmp * sign || a.key.localeCompare(b.key);
    });
  }, [rows, query, sort]);

  // Totals for the visible rows: sum the inputs, then derive the ratios. Never an average of row ratios.
  const totals = useMemo(() => {
    const sum = visible.reduce<Totals>(
      (t, r) => ({
        spendCents: t.spendCents + r.metrics.spendCents,
        revenueCents: t.revenueCents + r.metrics.revenueCents,
        impressions: t.impressions + r.metrics.impressions,
        clicks: t.clicks + r.metrics.clicks,
        conversions: Math.round((t.conversions + r.metrics.conversions) * 10_000) / 10_000,
        rows: t.rows + r.metrics.rows,
      }),
      { spendCents: 0, revenueCents: 0, impressions: 0, clicks: 0, conversions: 0, rows: 0 },
    );
    return toMetrics(sum);
  }, [visible]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'campaign' ? 'asc' : 'desc' }));

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="relative w-full max-w-xs">
          <label htmlFor="campaign-search" className="sr-only">
            Search campaigns
          </label>
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input id="campaign-search" type="search" className="input pl-8" placeholder="Search campaign or channel" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <p className="muted text-[0.84rem]" role="status">
          Showing {visible.length} of {rows.length} campaigns
        </p>
      </div>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Campaign performance for the selected period. Column headers are buttons that sort the table.</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort.key === c.key;
                const SortIcon = !active ? IconSort : sort.dir === 'asc' ? IconArrowUp : IconArrowDown;
                return (
                  <th key={c.key} scope="col" className={c.numeric ? 'r' : ''} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} title={c.title}>
                    <button type="button" onClick={() => toggle(c.key)} className={`inline-flex items-center gap-1 uppercase tracking-[0.04em] ${active ? 'text-ink' : ''}`}>
                      {c.label}
                      <SortIcon size={11} className={active ? '' : 'opacity-50'} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="!bg-transparent !text-[0.86rem] !font-normal !normal-case !tracking-normal !text-ink min-w-[14rem] max-w-[22rem] !whitespace-normal">
                  <Link href={`${basePath}/campaigns/${encodeURIComponent(r.key)}${rangeQuery}`} className="font-semibold [overflow-wrap:anywhere] hover:underline">
                    {r.campaign}
                  </Link>
                  <span className="muted mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.78rem]">
                    {r.channel}
                    {r.flags ? <span className="badge badge-warn">{r.flags} to review</span> : null}
                  </span>
                </th>
                <td className="r font-semibold">{money(r.metrics.spendCents)}</td>
                {showComparison ? (
                  <td className="r">
                    <Delta change={r.spendChange} />
                  </td>
                ) : null}
                <td className="r">{formatInteger(r.metrics.impressions)}</td>
                <td className="r">{formatInteger(r.metrics.clicks)}</td>
                <td className="r">{formatRate(r.metrics.ctr)}</td>
                <td className="r">{money(r.metrics.cpcCents)}</td>
                <td className="r">{formatCount(r.metrics.conversions)}</td>
                <td className="r">{money(r.metrics.cpaCents)}</td>
                <td className="r">{money(r.metrics.revenueCents)}</td>
                <td className="r">{formatRoas(r.metrics.roas)}</td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="!py-8 text-center">
                  <span className="muted">No campaign matches “{query}”.</span>{' '}
                  <button type="button" className="link" onClick={() => setQuery('')}>
                    Clear search
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
          {visible.length > 1 ? (
            <tfoot>
              <tr>
                <td>Total of {visible.length} campaigns shown</td>
                <td className="r">{money(totals.spendCents)}</td>
                {showComparison ? <td /> : null}
                <td className="r">{formatInteger(totals.impressions)}</td>
                <td className="r">{formatInteger(totals.clicks)}</td>
                <td className="r">{formatRate(totals.ctr)}</td>
                <td className="r">{money(totals.cpcCents)}</td>
                <td className="r">{formatCount(totals.conversions)}</td>
                <td className="r">{money(totals.cpaCents)}</td>
                <td className="r">{money(totals.revenueCents)}</td>
                <td className="r">{formatRoas(totals.roas)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
