import { parseDateCell } from '../analytics/dates';
import { CONVERSION_SCALE } from '../analytics/metrics';
import { campaignKey, type CampaignDay } from '../analytics/types';
import type { ParsedCsv } from './csv';
import { validateMapping, type CanonicalField, type ImportMapping } from './mapping';
import { parseDecimal, type NumberProblem } from './numbers';

/**
 * Turns mapped CSV rows into canonical campaign-day records.
 *
 * Nothing is dropped silently. A row either becomes a record or produces at
 * least one error that names the row, the field and the reason. Warnings mark
 * values that were accepted but deserve a look.
 */
export interface ImportIssue {
  severity: 'error' | 'warning';
  /** 1-based line in the file; null for file-level issues. */
  line: number | null;
  field: CanonicalField | null;
  code: string;
  message: string;
}

export interface NormalizedRecord extends CampaignDay {
  line: number;
}

export interface NormalizeResult {
  records: NormalizedRecord[];
  issues: ImportIssue[];
  rowsInFile: number;
  /** Rows that produced at least one error and were not turned into records. */
  rejectedRows: number;
  coverage: { from: string; to: string } | null;
  channels: string[];
}

export interface NormalizeOptions {
  /** Workspace currency. A mapped currency column must match it on every row. */
  currency: string;
  /** Today's date in the reporting timezone; later dates get a warning. */
  today?: string;
}

const NUMBER_MESSAGES: Record<NumberProblem, string> = {
  missing: 'is blank. A blank is not treated as zero; enter 0 if the value really was zero',
  negative: 'is negative',
  not_a_number: 'is not a plain number',
  not_whole: 'must be a whole number',
  too_large: 'is larger than the allowed maximum',
};

const FIELD_LABEL: Record<CanonicalField, string> = {
  date: 'Date',
  channel: 'Channel',
  campaign: 'Campaign',
  currency: 'Currency',
  spend: 'Spend',
  impressions: 'Impressions',
  clicks: 'Clicks',
  conversions: 'Conversions',
  revenue: 'Revenue',
};

export function normalizeCsv(parsed: ParsedCsv, mapping: ImportMapping, options: NormalizeOptions): NormalizeResult {
  const mappingProblems = validateMapping(mapping, parsed.headers);
  if (mappingProblems.length) {
    return {
      records: [],
      issues: mappingProblems.map((message) => ({ severity: 'error', line: null, field: null, code: 'mapping', message })),
      rowsInFile: parsed.rows.length,
      rejectedRows: parsed.rows.length,
      coverage: null,
      channels: [],
    };
  }

  const index = new Map(parsed.headers.map((h, i) => [h, i]));
  const col = (field: CanonicalField): number | null => {
    const header = mapping.columns[field];
    return header === undefined ? null : (index.get(header) ?? null);
  };
  const cols = {
    date: col('date')!,
    channel: col('channel'),
    campaign: col('campaign')!,
    currency: col('currency'),
    spend: col('spend')!,
    impressions: col('impressions')!,
    clicks: col('clicks')!,
    conversions: col('conversions')!,
    revenue: col('revenue'),
  };

  const issues: ImportIssue[] = [];
  const candidates: NormalizedRecord[] = [];
  const rejectedLines = new Set<number>();
  let cleanedCount = 0;
  let roundedCount = 0;

  for (const row of parsed.rows) {
    const { line, cells } = row;
    let failed = false;
    const error = (field: CanonicalField | null, code: string, message: string) => {
      issues.push({ severity: 'error', line, field, code, message });
      failed = true;
    };
    const warn = (field: CanonicalField | null, code: string, message: string) => issues.push({ severity: 'warning', line, field, code, message });

    if (cells.length !== parsed.headers.length) {
      error(null, 'column_count', `Row has ${cells.length} values but the header has ${parsed.headers.length} columns.`);
      rejectedLines.add(line);
      continue;
    }
    const cell = (i: number): string => (cells[i] ?? '').trim();

    const dateRaw = cell(cols.date);
    const date = parseDateCell(dateRaw, mapping.dateFormat);
    if (!dateRaw) error('date', 'missing', 'Date is blank.');
    else if (!date) error('date', 'invalid_date', `Date "${dateRaw}" is not a valid ${mapping.dateFormat} date.`);
    else if (options.today && date > options.today) warn('date', 'future_date', `Date ${date} is after today in the reporting timezone.`);

    const channel = cols.channel === null ? (mapping.fixedChannel ?? '').trim() : cell(cols.channel);
    if (!channel) error('channel', 'missing', 'Channel is blank.');
    else if (channel.length > 120) error('channel', 'too_long', 'Channel is longer than 120 characters.');

    const campaign = cell(cols.campaign);
    if (!campaign) error('campaign', 'missing', 'Campaign is blank.');
    else if (campaign.length > 200) error('campaign', 'too_long', 'Campaign is longer than 200 characters.');

    if (cols.currency !== null) {
      const currency = cell(cols.currency).toUpperCase();
      if (!currency) error('currency', 'missing', 'Currency is blank.');
      else if (currency !== options.currency) {
        error('currency', 'currency_mismatch', `Currency ${currency} does not match the workspace currency ${options.currency}. Amounts in different currencies are never combined.`);
      }
    }

    const num = (field: 'spend' | 'impressions' | 'clicks' | 'conversions' | 'revenue', i: number, scale: number, whole = false): number | null => {
      const parsedNumber = parseDecimal(cell(i), scale, { whole });
      if (!parsedNumber.ok) {
        error(field, parsedNumber.problem, `${FIELD_LABEL[field]} ${NUMBER_MESSAGES[parsedNumber.problem]} ("${cell(i)}").`);
        return null;
      }
      if (parsedNumber.cleaned) cleanedCount++;
      if (parsedNumber.rounded) roundedCount++;
      return parsedNumber.scaled;
    };

    const spendCents = num('spend', cols.spend, 2);
    const impressions = num('impressions', cols.impressions, 0, true);
    const clicks = num('clicks', cols.clicks, 0, true);
    const conversionsScaled = num('conversions', cols.conversions, 4);
    const revenueCents = cols.revenue === null ? 0 : num('revenue', cols.revenue, 2);

    if (impressions !== null && clicks !== null && clicks > impressions) {
      error('clicks', 'clicks_exceed_impressions', `Clicks (${clicks}) cannot exceed impressions (${impressions}).`);
    }
    if (failed || !date || spendCents === null || impressions === null || clicks === null || conversionsScaled === null || revenueCents === null) {
      rejectedLines.add(line);
      continue;
    }
    const conversions = conversionsScaled / CONVERSION_SCALE;
    if (conversions > clicks && clicks > 0) warn('conversions', 'conversions_exceed_clicks', `Conversions (${conversions}) exceed clicks (${clicks}); this can be legitimate with view-through attribution.`);
    if (spendCents === 0 && (clicks > 0 || conversions > 0)) warn('spend', 'activity_without_spend', 'Row has clicks or conversions but zero spend.');
    candidates.push({ line, date, channel, campaign, spendCents, impressions, clicks, conversions, revenueCents });
  }

  // Duplicate grain: reject every row that shares a key, because the file gives no way to tell which one is right.
  const byKey = new Map<string, NormalizedRecord[]>();
  for (const r of candidates) {
    const k = `${r.date}|${campaignKey(r.channel, r.campaign)}`;
    const list = byKey.get(k);
    if (list) list.push(r);
    else byKey.set(k, [r]);
  }
  const records: NormalizedRecord[] = [];
  for (const group of byKey.values()) {
    if (group.length === 1) {
      records.push(group[0]!);
      continue;
    }
    const lines = group.map((g) => g.line).join(', ');
    for (const r of group) {
      rejectedLines.add(r.line);
      issues.push({
        severity: 'error',
        line: r.line,
        field: null,
        code: 'duplicate_key',
        message: `Rows ${lines} share the same date, channel and campaign (${r.date}, ${r.channel}, ${r.campaign}). Aggregate them into one row before importing.`,
      });
    }
  }
  records.sort((a, b) => a.line - b.line);

  if (cleanedCount) {
    issues.push({ severity: 'warning', line: null, field: null, code: 'cleaned_numbers', message: `${cleanedCount} value(s) contained currency symbols, percent signs or thousands separators, which were removed.` });
  }
  if (roundedCount) {
    issues.push({ severity: 'warning', line: null, field: null, code: 'rounded_numbers', message: `${roundedCount} value(s) had more decimal places than are stored (2 for money, 4 for conversions) and were rounded half-up.` });
  }
  if (cols.revenue === null) {
    issues.push({ severity: 'warning', line: null, field: 'revenue', code: 'no_revenue', message: 'No revenue column is mapped. Revenue is recorded as 0 for these rows and ROAS will not be meaningful for them.' });
  }
  if (cols.currency === null) {
    issues.push({ severity: 'warning', line: null, field: 'currency', code: 'assumed_currency', message: `No currency column is mapped. All amounts are taken to be in the workspace currency, ${options.currency}.` });
  }

  const dates = records.map((r) => r.date).sort();
  issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return {
    records,
    issues,
    rowsInFile: parsed.rows.length,
    rejectedRows: rejectedLines.size,
    coverage: dates.length ? { from: dates[0]!, to: dates.at(-1)! } : null,
    channels: [...new Set(records.map((r) => r.channel))].sort(),
  };
}
