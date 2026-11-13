/**
 * Regenerates the sample CSV files in public/samples from the deterministic demo dataset.
 * They are synthetic and exist so the import flow can be tried (and tested) end to end:
 *
 *   fernhill-google-ads-pmax.csv         a platform-style export that needs column mapping
 *   fernhill-brand-search-restated.csv   overlaps existing rows: 4 identical, 3 with changed values
 *   fernhill-meta-export-with-errors.csv contains invalid rows of several kinds
 *
 * Usage: npx tsx scripts/make-samples.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { addDays } from '../src/lib/analytics';
import { buildDemoClients } from '../src/lib/demo/data';

const out = 'public/samples';
mkdirSync(out, { recursive: true });
const money = (cents: number) => (cents / 100).toFixed(2);
const fernhill = buildDemoClients().find((c) => c.name === 'Fernhill Outdoor')!;

// 1. A new Google Ads campaign, 1-11 Nov, with Google-style headers and no channel column.
const pmax = ['Day,Campaign,Currency code,Cost,Impr.,Clicks,Conversions,Conv. value'];
for (let i = 0; i < 11; i++) {
  const spend = 21000 + ((i * 1373) % 4200);
  const impressions = 15200 + ((i * 911) % 3100);
  const clicks = 262 + ((i * 37) % 60);
  const conversions = (5.4 + ((i * 7) % 5) * 0.45).toFixed(2);
  const revenue = Math.round(Number(conversions) * 9150);
  pmax.push(`${addDays('2026-11-01', i)},Performance Max: winter range,USD,${money(spend)},${impressions},${clicks},${conversions},${money(revenue)}`);
}
writeFileSync(`${out}/fernhill-google-ads-pmax.csv`, `${pmax.join('\n')}\n`);

// 2. Brand search for 5-11 Nov in the canonical layout. The last three days are restated.
const restated = ['date,channel,campaign,currency,spend,impressions,clicks,conversions,revenue'];
const brand = fernhill.rows.filter((r) => r.channel === 'Google Ads' && r.campaign === 'Brand search' && r.date >= '2026-11-05');
for (const r of brand) {
  const changed = r.date >= '2026-11-09';
  const spend = changed ? Math.round(r.spendCents * 1.06) : r.spendCents;
  const conversions = changed ? Math.round((r.conversions + 0.75) * 100) / 100 : r.conversions;
  restated.push(`${r.date},${r.channel},${r.campaign},USD,${money(spend)},${r.impressions},${r.clicks},${conversions},${money(r.revenueCents)}`);
}
writeFileSync(`${out}/fernhill-brand-search-restated.csv`, `${restated.join('\n')}\n`);

// 3. A Meta-style export with deliberate problems.
const meta = [
  'Reporting starts,Campaign name,Amount spent (USD),Impressions,Link clicks,Results,Purchases conversion value',
  '2026-11-01,Advantage+ shopping test,142.10,16480,171,3,251.40',
  '2026-11-02,Advantage+ shopping test,138.75,15920,166,4,331.00',
  '2026-11-03,Advantage+ shopping test,,16210,169,2,170.20',
  '2026-11-04,Advantage+ shopping test,-12.00,400,6,0,0',
  '2026-11-31,Advantage+ shopping test,140.00,16000,160,3,240.00',
  '2026-11-05,Advantage+ shopping test,151.30,17040,9999999,3,262.10',
  '2026-11-06,Advantage+ shopping test,149.90,16800,174,3,248.80',
  '2026-11-06,Advantage+ shopping test,12.40,1350,14,0,0',
  '2026-11-07,Advantage+ shopping test,"$1,204.50",131900,1362,26,2190.00',
  '2026-11-08,Advantage+ shopping test,147.20,16550,170,n/a,255.00',
  '2026-11-09,Advantage+ shopping test,150.05,16900,176,4,330.10',
  '2026-11-10,Advantage+ shopping test,146.60,16300,168,3,246.90',
];
writeFileSync(`${out}/fernhill-meta-export-with-errors.csv`, `${meta.join('\n')}\n`);
console.log(`Wrote 3 sample files to ${out}`);
