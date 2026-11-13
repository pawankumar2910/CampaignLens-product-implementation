import { addDays, type CampaignDay, type CurrencyCode } from '../analytics';

/**
 * Deterministic synthetic data for the "Explore demo" sandbox.
 *
 * Every company, campaign and number here is fictional. Values come from a
 * seeded pseudo-random generator, so the same data is produced on every run and
 * tests can assert against it. The window is fixed (90 days ending 11 Nov 2026)
 * rather than relative to "today", which keeps the demo reproducible.
 *
 * Each client carries a few recognisable patterns so the investigation queue
 * has something real to find: a CPA that deteriorates, a spend spike, a newly
 * launched campaign, a paused campaign, missing reporting days, low volume, and
 * budgets that are over and under pace.
 */
export const DEMO_END = '2026-11-11';
export const DEMO_DAYS = 90;
export const DEMO_START = addDays(DEMO_END, -(DEMO_DAYS - 1));
export const DEMO_AGENCY_NAME = 'Juniper & Rye (demo agency)';

interface CampaignSpec {
  channel: string;
  campaign: string;
  /** Average daily spend in currency units. */
  dailySpend: number;
  /** Cost per thousand impressions. */
  cpm: number;
  cpc: number;
  /** Click-to-conversion rate. */
  cvr: number;
  /** Average order value; 0 for lead generation (no revenue reported). */
  aov: number;
  /** Spend multiplier on Saturdays and Sundays. */
  weekend: number;
  /** First and last day index (0-89) with delivery. */
  startDay?: number;
  endDay?: number;
  /** Platform reports fractional (data-driven) conversions. */
  fractional?: boolean;
  spendTrend?: (day: number) => number;
  cvrTrend?: (day: number) => number;
  /** Day indexes missing from the export (a reporting gap, not a pause). */
  missingDays?: number[];
}

export interface DemoBudget {
  scope: 'client' | 'campaign';
  channel: string | null;
  campaign: string | null;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
}

export interface DemoClient {
  name: string;
  currency: CurrencyCode;
  timezone: string;
  conversionDefinition: string;
  brandColor: string;
  rows: CampaignDay[];
  budgets: DemoBudget[];
}

const OCT = { periodStart: '2026-10-01', periodEnd: '2026-10-31' };
const NOV = { periodStart: '2026-11-01', periodEnd: '2026-11-30' };
const clientBudget = (period: typeof OCT, amount: number): DemoBudget => ({ scope: 'client', channel: null, campaign: null, ...period, amountCents: amount * 100 });

const SPECS: Array<Omit<DemoClient, 'rows'> & { campaigns: CampaignSpec[] }> = [
  {
    name: 'Fernhill Outdoor',
    currency: 'USD',
    timezone: 'America/Denver',
    conversionDefinition: 'Online purchases. Google Ads: data-driven attribution. Meta Ads: 7-day click, 1-day view.',
    brandColor: '#1B4D3E',
    campaigns: [
      { channel: 'Google Ads', campaign: 'Brand search', dailySpend: 140, cpm: 38, cpc: 0.65, cvr: 0.065, aov: 96, weekend: 0.9, fractional: true },
      { channel: 'Google Ads', campaign: 'Non-brand: hiking boots', dailySpend: 260, cpm: 52, cpc: 1.4, cvr: 0.026, aov: 124, weekend: 0.95, fractional: true },
      { channel: 'Google Ads', campaign: 'Shopping: core range', dailySpend: 320, cpm: 14, cpc: 0.8, cvr: 0.022, aov: 88, weekend: 1.05, fractional: true },
      // Paused after day 55: shows up as "spend stopped" against the previous period.
      { channel: 'Google Ads', campaign: 'Display remarketing', dailySpend: 70, cpm: 4.5, cpc: 0.55, cvr: 0.008, aov: 80, weekend: 1, endDay: 55, fractional: true },
      // Click-to-conversion rate decays from day 62: CPA rises while spend stays level.
      { channel: 'Meta Ads', campaign: 'Prospecting: lookalike', dailySpend: 300, cpm: 11, cpc: 1.1, cvr: 0.018, aov: 92, weekend: 1.05, cvrTrend: (d) => (d < 62 ? 1 : Math.max(0.55, 1 - (d - 62) * 0.02)) },
      // Spend nearly doubles for the final 12 days.
      { channel: 'Meta Ads', campaign: 'Retargeting: cart abandoners', dailySpend: 110, cpm: 16, cpc: 0.9, cvr: 0.045, aov: 101, weekend: 1, spendTrend: (d) => (d >= 78 ? 1.9 : 1) },
      // Launched on day 70: no baseline in the previous period.
      { channel: 'Meta Ads', campaign: 'Autumn sale launch', dailySpend: 180, cpm: 9, cpc: 0.85, cvr: 0.021, aov: 74, weekend: 1.1, startDay: 70 },
      // A small test with too few conversions to judge.
      { channel: 'TikTok Ads', campaign: 'Trail creators test', dailySpend: 60, cpm: 6, cpc: 0.9, cvr: 0.003, aov: 70, weekend: 1.15 },
    ],
    budgets: [
      clientBudget(OCT, 38_000),
      clientBudget(NOV, 36_000),
      { scope: 'campaign', channel: 'Meta Ads', campaign: 'Retargeting: cart abandoners', ...NOV, amountCents: 4_000_00 },
    ],
  },
  {
    name: 'Brightside Dental Group',
    currency: 'USD',
    timezone: 'America/Chicago',
    conversionDefinition: 'Leads: submitted consultation forms and tracked calls over 60 seconds. No revenue is reported to the ad platforms.',
    brandColor: '#1F4E79',
    campaigns: [
      { channel: 'Google Ads', campaign: 'Search: dental implants', dailySpend: 180, cpm: 95, cpc: 6.5, cvr: 0.07, aov: 0, weekend: 0.6 },
      { channel: 'Google Ads', campaign: 'Search: emergency dentist', dailySpend: 95, cpm: 80, cpc: 4.8, cvr: 0.09, aov: 0, weekend: 1.1 },
      // Three days are missing from the Meta export (3-5 Nov).
      { channel: 'Meta Ads', campaign: 'Lead form: new patient offer', dailySpend: 120, cpm: 18, cpc: 2.2, cvr: 0.05, aov: 0, weekend: 0.9, missingDays: [81, 82, 83] },
      { channel: 'Microsoft Ads', campaign: 'Search: general dentistry', dailySpend: 25, cpm: 60, cpc: 3.2, cvr: 0.03, aov: 0, weekend: 0.7 },
    ],
    budgets: [clientBudget(OCT, 12_500), clientBudget(NOV, 12_000)],
  },
  {
    name: 'Kettle & Loom',
    currency: 'GBP',
    timezone: 'Europe/London',
    conversionDefinition: 'Online orders, 7-day click attribution on all platforms.',
    brandColor: '#7A3E1D',
    campaigns: [
      // Seasonal ramp from day 50.
      { channel: 'Google Ads', campaign: 'Shopping: tea gifts', dailySpend: 220, cpm: 12, cpc: 0.55, cvr: 0.024, aov: 42, weekend: 1.1, fractional: true, spendTrend: (d) => (d < 50 ? 1 : 1 + (d - 50) * 0.02) },
      { channel: 'Google Ads', campaign: 'Brand search', dailySpend: 60, cpm: 30, cpc: 0.4, cvr: 0.08, aov: 46, weekend: 1, fractional: true },
      { channel: 'Meta Ads', campaign: 'Prospecting: gift guide', dailySpend: 180, cpm: 8, cpc: 0.7, cvr: 0.016, aov: 39, weekend: 1.15 },
      // Spend with no reported conversions.
      { channel: 'Pinterest Ads', campaign: 'Autumn boards', dailySpend: 45, cpm: 5, cpc: 0.6, cvr: 0, aov: 40, weekend: 1.2 },
    ],
    budgets: [clientBudget(OCT, 16_000), clientBudget(NOV, 24_000)],
  },
];

/** Small, fast, well-known 32-bit PRNG. Deterministic for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generateRows(clientName: string, spec: CampaignSpec): CampaignDay[] {
  const rnd = mulberry32(hashSeed(`${clientName}|${spec.channel}|${spec.campaign}`));
  const jitter = (spread: number) => 1 - spread / 2 + rnd() * spread;
  const rows: CampaignDay[] = [];
  for (let d = 0; d < DEMO_DAYS; d++) {
    // Draw the same random numbers for every day so skipping a day never shifts later values.
    const [jSpend, jCpm, jCpc, jCvr, jAov, jRound] = [jitter(0.24), jitter(0.2), jitter(0.2), jitter(0.4), jitter(0.3), rnd()];
    if (d < (spec.startDay ?? 0) || d > (spec.endDay ?? DEMO_DAYS - 1) || spec.missingDays?.includes(d)) continue;
    const date = addDays(DEMO_START, d);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekendFactor = weekday === 0 || weekday === 6 ? spec.weekend : 1;
    const spend = spec.dailySpend * weekendFactor * (spec.spendTrend?.(d) ?? 1) * jSpend;
    const spendCents = Math.round(spend * 100);
    const impressions = Math.max(1, Math.round((spend / (spec.cpm * jCpm)) * 1000));
    const clicks = Math.min(impressions, Math.round(spend / (spec.cpc * jCpc)));
    const expected = clicks * spec.cvr * (spec.cvrTrend?.(d) ?? 1) * jCvr;
    const conversions = spec.fractional ? Math.round(expected * 100) / 100 : Math.floor(expected) + (jRound < expected - Math.floor(expected) ? 1 : 0);
    const revenueCents = Math.round(conversions * spec.aov * jAov * 100);
    rows.push({ date, channel: spec.channel, campaign: spec.campaign, spendCents, impressions, clicks, conversions, revenueCents });
  }
  return rows;
}

export function buildDemoClients(): DemoClient[] {
  return SPECS.map(({ campaigns, ...client }) => ({ ...client, rows: campaigns.flatMap((c) => generateRows(client.name, c)) }));
}
