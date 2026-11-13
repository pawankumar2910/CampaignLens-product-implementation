import { DATE_FORMATS, type DateFormat } from '../analytics/dates';

/**
 * Canonical schema and column mapping.
 *
 * Canonical row grain: one row per date + channel + campaign.
 * A mapping says which file column feeds each canonical field. Channel may be a
 * fixed value (single-platform exports have no channel column) and revenue may be
 * explicitly declared as "not reported".
 */
export type CanonicalField = 'date' | 'channel' | 'campaign' | 'currency' | 'spend' | 'impressions' | 'clicks' | 'conversions' | 'revenue';

export const CANONICAL_FIELDS: ReadonlyArray<{ field: CanonicalField; label: string; required: boolean; help: string }> = [
  { field: 'date', label: 'Date', required: true, help: 'Calendar day of delivery in the reporting timezone.' },
  { field: 'channel', label: 'Channel', required: true, help: 'Ad platform, e.g. Google Ads. Use a fixed value if the file covers one platform.' },
  { field: 'campaign', label: 'Campaign', required: true, help: 'Campaign name as it should appear in reports.' },
  { field: 'spend', label: 'Spend', required: true, help: 'Amount spent, in the workspace currency.' },
  { field: 'impressions', label: 'Impressions', required: true, help: 'Whole number.' },
  { field: 'clicks', label: 'Clicks', required: true, help: 'Whole number, not above impressions.' },
  { field: 'conversions', label: 'Conversions', required: true, help: 'Platform-reported conversions. Decimals are allowed.' },
  { field: 'revenue', label: 'Reported revenue', required: false, help: 'Platform-attributed conversion value. Leave unmapped if the platform reports none.' },
  { field: 'currency', label: 'Currency', required: false, help: 'If mapped, every row must match the workspace currency.' },
];

export interface ImportMapping {
  /** Canonical field -> header name in the file. */
  columns: Partial<Record<CanonicalField, string>>;
  /** Used for every row when no channel column is mapped. */
  fixedChannel: string | null;
  dateFormat: DateFormat;
}

const SYNONYMS: Record<CanonicalField, string[]> = {
  date: ['date', 'day', 'reporting starts', 'report date', 'start date'],
  channel: ['channel', 'platform', 'source', 'network', 'publisher platform'],
  campaign: ['campaign', 'campaign name'],
  currency: ['currency', 'currency code', 'account currency'],
  spend: ['spend', 'cost', 'amount spent', 'spent', 'total spent', 'media cost'],
  impressions: ['impressions', 'impr', 'impr.'],
  clicks: ['clicks', 'link clicks', 'clicks (all)'],
  conversions: ['conversions', 'conv', 'conv.', 'results', 'purchases', 'leads', 'total conversions'],
  revenue: ['revenue', 'conversion value', 'conv. value', 'conv value', 'purchases conversion value', 'purchase conversion value', 'total conversion value', 'sales'],
};

/** "Amount spent (USD)" -> "amount spent" */
const normalizeHeader = (h: string): string =>
  h
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Propose a mapping from header names. The user always reviews it before anything is imported. */
export function suggestMapping(headers: string[]): ImportMapping {
  const columns: Partial<Record<CanonicalField, string>> = {};
  const used = new Set<string>();
  for (const { field } of CANONICAL_FIELDS) {
    const match = SYNONYMS[field].map((syn) => headers.find((h) => !used.has(h) && normalizeHeader(h) === syn)).find(Boolean);
    if (match) {
      columns[field] = match;
      used.add(match);
    }
  }
  return { columns, fixedChannel: null, dateFormat: 'YYYY-MM-DD' };
}

/** Problems that prevent normalization from starting. */
export function validateMapping(mapping: ImportMapping, headers: string[]): string[] {
  const problems: string[] = [];
  const headerSet = new Set(headers);
  const usedBy = new Map<string, CanonicalField>();
  for (const { field, label, required } of CANONICAL_FIELDS) {
    const column = mapping.columns[field];
    if (column) {
      if (!headerSet.has(column)) problems.push(`${label} is mapped to "${column}", which is not a column in this file.`);
      const other = usedBy.get(column);
      if (other) problems.push(`The column "${column}" is mapped to more than one field.`);
      usedBy.set(column, field);
    } else if (field === 'channel') {
      if (!mapping.fixedChannel?.trim()) problems.push('Map a Channel column or enter one channel name for the whole file.');
    } else if (required) {
      problems.push(`Map a column to ${label}.`);
    }
  }
  if (mapping.fixedChannel && mapping.fixedChannel.trim().length > 120) problems.push('The channel name must be 120 characters or fewer.');
  if (!DATE_FORMATS.includes(mapping.dateFormat)) problems.push('Choose a date format.');
  return problems;
}
