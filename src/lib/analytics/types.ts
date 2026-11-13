/**
 * Core analytics types.
 *
 * Row grain: one row per calendar date + channel + campaign for one client.
 * Money is held as integer minor units (cents/pence/paise) so sums are exact.
 * Conversions may be fractional (data-driven attribution) with up to 4 decimals.
 */
export interface CampaignDay {
  /** Calendar date in the client's reporting timezone, YYYY-MM-DD. */
  date: string;
  channel: string;
  campaign: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
}

export interface Totals {
  spendCents: number;
  revenueCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Number of campaign-day rows that were summed. */
  rows: number;
}

/** Ratios are `null` when the denominator is zero: "unavailable", never 0 or Infinity. */
export interface Metrics extends Totals {
  /** clicks / impressions, as a fraction (0.02 = 2%). */
  ctr: number | null;
  /** spend / clicks, in minor units (may be fractional). */
  cpcCents: number | null;
  /** spend / conversions, in minor units (may be fractional). */
  cpaCents: number | null;
  /** reported revenue / spend. Not profit and not incremental lift. */
  roas: number | null;
}

export interface DateRange {
  /** Inclusive start, YYYY-MM-DD. */
  from: string;
  /** Inclusive end, YYYY-MM-DD. */
  to: string;
}

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'CAD' | 'AUD';
export const CURRENCIES: readonly CurrencyCode[] = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'];

export const campaignKey = (channel: string, campaign: string): string => JSON.stringify([channel, campaign]);
export const parseCampaignKey = (key: string): { channel: string; campaign: string } | null => {
  try {
    const v: unknown = JSON.parse(key);
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string') {
      return { channel: v[0], campaign: v[1] };
    }
  } catch {
    /* fall through */
  }
  return null;
};
