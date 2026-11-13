import type { CampaignDay } from '@/lib/analytics';
import { parseCsv } from '@/lib/import/csv';
import type { ImportMapping } from '@/lib/import/mapping';
import { normalizeCsv } from '@/lib/import/normalize';

export const HEADER = 'date,channel,campaign,currency,spend,impressions,clicks,conversions,revenue';
export const RAW = '2026-11-01,Google,Search,USD,100,10000,200,10,500';
export const csv = (...lines: string[]) => `${HEADER}\n${lines.join('\n')}`;

export const CANONICAL: ImportMapping = {
  columns: { date: 'date', channel: 'channel', campaign: 'campaign', currency: 'currency', spend: 'spend', impressions: 'impressions', clicks: 'clicks', conversions: 'conversions', revenue: 'revenue' },
  fixedChannel: null,
  dateFormat: 'YYYY-MM-DD',
};

export const normalize = (text: string, mapping: ImportMapping = CANONICAL, currency = 'USD') => normalizeCsv(parseCsv(text), mapping, { currency });

/** Build a campaign-day row. Money arguments are whole currency units for readability. */
export function day(date: string, channel: string, campaign: string, spend: number, impressions: number, clicks: number, conversions: number, revenue: number): CampaignDay {
  return { date, channel, campaign, spendCents: Math.round(spend * 100), impressions, clicks, conversions, revenueCents: Math.round(revenue * 100) };
}
