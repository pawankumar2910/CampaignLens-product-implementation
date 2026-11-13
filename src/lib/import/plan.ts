import { campaignKey, type CampaignDay } from '../analytics/types';
import type { NormalizedRecord } from './normalize';

/**
 * Repeat-import policy.
 *
 * The grain key is date + channel + campaign within one client. Comparing a
 * file with what is already stored gives three groups:
 *   - new        key not stored yet                -> inserted
 *   - unchanged  key stored with identical values  -> skipped (re-importing a file is a no-op)
 *   - conflict   key stored with different values  -> the user must choose: replace or keep
 */
export type ConflictPolicy = 'replace' | 'keep';

export const rowKey = (r: Pick<CampaignDay, 'date' | 'channel' | 'campaign'>): string => `${r.date}|${campaignKey(r.channel, r.campaign)}`;

export interface Conflict {
  incoming: NormalizedRecord;
  existing: CampaignDay;
  /** Names of the fields whose values differ. */
  changed: Array<'spend' | 'impressions' | 'clicks' | 'conversions' | 'revenue'>;
}

export interface ImportPlan {
  inserts: NormalizedRecord[];
  unchanged: NormalizedRecord[];
  conflicts: Conflict[];
}

export function planImport(records: readonly NormalizedRecord[], existing: readonly CampaignDay[]): ImportPlan {
  const stored = new Map(existing.map((e) => [rowKey(e), e]));
  const plan: ImportPlan = { inserts: [], unchanged: [], conflicts: [] };
  for (const r of records) {
    const e = stored.get(rowKey(r));
    if (!e) {
      plan.inserts.push(r);
      continue;
    }
    const changed: Conflict['changed'] = [];
    if (e.spendCents !== r.spendCents) changed.push('spend');
    if (e.impressions !== r.impressions) changed.push('impressions');
    if (e.clicks !== r.clicks) changed.push('clicks');
    if (Math.round(e.conversions * 10_000) !== Math.round(r.conversions * 10_000)) changed.push('conversions');
    if (e.revenueCents !== r.revenueCents) changed.push('revenue');
    if (changed.length) plan.conflicts.push({ incoming: r, existing: e, changed });
    else plan.unchanged.push(r);
  }
  return plan;
}
