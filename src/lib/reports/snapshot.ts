import type { Analysis } from '../analytics/analyze';
import type { Thresholds } from '../analytics/investigate';
import type { ClientBranding } from '../db/schema';

/**
 * A report shows a snapshot: the complete, already-computed analysis for its
 * period, stored as JSON on the report. The preview, the PDF and the shared
 * link all render from this object and never query workspace data, so a
 * finalized report cannot change when new data is imported and a share link
 * cannot reach anything except the snapshot.
 */
export interface ReportProvenance {
  /** Imports that contributed rows to the report period. */
  imports: Array<{ fileName: string; source: string; importedAt: string; importedBy: string; coverageStart: string | null; coverageEnd: string | null }>;
  /** Campaign-day rows in the report period. */
  rowCount: number;
  /** Last date with any data for the client when the snapshot was taken. */
  dataThrough: string | null;
}

export interface ReportSnapshot {
  version: 1;
  /** ISO timestamp of when the data was captured. */
  generatedAt: string;
  agencyName: string;
  client: { name: string; currency: string; timezone: string; conversionDefinition: string; branding: ClientBranding };
  analysis: Analysis;
  thresholds: Thresholds;
  provenance: ReportProvenance;
}

export const REPORT_SECTIONS = [
  { id: 'summary', label: 'Summary', description: 'Rule-based observations, caveats and next checks.' },
  { id: 'kpis', label: 'Key metrics', description: 'Spend, conversions, CPA, ROAS and more, with the previous period.' },
  { id: 'trend', label: 'Daily trend', description: 'Daily spend and conversions for the period.' },
  { id: 'channels', label: 'Channels', description: 'Performance by ad platform.' },
  { id: 'campaigns', label: 'Campaigns', description: 'Performance by campaign.' },
  { id: 'pacing', label: 'Budget pacing', description: 'Budgets that overlap the period.' },
  { id: 'review', label: 'Items under review', description: 'Open investigation items and the planned next check.' },
  { id: 'method', label: 'Method and data notes', description: 'How figures are calculated, data coverage and sources.' },
] as const;

export type ReportSectionId = (typeof REPORT_SECTIONS)[number]['id'];
export const ALL_SECTION_IDS: ReportSectionId[] = REPORT_SECTIONS.map((s) => s.id);
export const DEFAULT_SECTIONS: ReportSectionId[] = ['summary', 'kpis', 'trend', 'channels', 'campaigns', 'pacing', 'method'];

export const isSectionId = (v: string): v is ReportSectionId => (ALL_SECTION_IDS as string[]).includes(v);
