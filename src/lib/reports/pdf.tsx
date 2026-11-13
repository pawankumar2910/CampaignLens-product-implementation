import { Circle, Document, Line, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { Children, type ReactNode } from 'react';
import {
  daysInclusive, formatChange, formatCount, formatDate, formatDateRange, formatMoney, formatPoints, formatRate, formatRoas, KIND_LABEL, METHOD_NOTES, pluralize, type BudgetPacing, type Change,
  type RateChange,
} from '../analytics';
import { formatTimestamp } from '../format-time';
import type { ReportSectionId, ReportSnapshot } from './snapshot';
import { axisLabel, trendGeometry } from './trend';

/**
 * PDF export, rendered on the server from the report snapshot (never from live
 * workspace data). Page breaks are controlled: KPI blocks, charts, pacing cards,
 * review items and table rows are never split, and every section heading is bound
 * to its first block (a table header to its first rows) so it cannot be stranded.
 *
 * Line height is left at the library default on purpose. In @react-pdf/renderer 4.9 an
 * inherited lineHeight stops dynamic page numbers from rendering, and a per-text
 * lineHeight double-spaces wrapped lines. Spacing is added with margins instead.
 *
 * The PDF uses the built-in Helvetica and Times fonts, which cover Latin text.
 * Characters outside that set (for example CJK campaign names) are replaced with
 * "?" here; the web report shows them correctly.
 */
export interface ReportPdfInput {
  title: string;
  commentary: string;
  sections: string[];
  snapshot: ReportSnapshot;
  status: 'draft' | 'final';
  finalizedAt: string | null;
}

const INK = '#1b231f';
const INK_2 = '#46504a';
const INK_3 = '#636b63';
const LINE = '#ded8c8';
const SUNKEN = '#eeeadf';
const CHART_1 = '#23805a';
const CHART_2 = '#8a63b8';

/** Keep text within what the built-in PDF fonts can draw. */
export function pdfText(value: string): string {
  return value
    .replace(/−/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF€–—•\n]/g, '?');
}

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 54, paddingHorizontal: 40, fontFamily: 'Helvetica', fontSize: 9, color: INK },
  eyebrow: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.8, textTransform: 'uppercase', color: INK_3 },
  title: { fontFamily: 'Times-Roman', fontSize: 22, marginTop: 6 },
  meta: { fontSize: 8.5, color: INK_3, marginTop: 3 },
  section: { marginTop: 16, paddingTop: 12, borderTopWidth: 0.75, borderTopColor: LINE },
  h2: { fontFamily: 'Times-Roman', fontSize: 14, marginBottom: 7 },
  note: { fontSize: 7.5, color: INK_3, marginTop: 1.5 },
  bullet: { flexDirection: 'row', marginBottom: 4.5 },
  bulletDot: { width: 9, color: INK_3 },
  bulletText: { flex: 1 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 4.5 },
  th: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: INK_3, textTransform: 'uppercase', letterSpacing: 0.4 },
  num: { textAlign: 'right' },
  card: { borderWidth: 0.75, borderColor: LINE, borderRadius: 4, padding: 8, marginBottom: 7 },
  footerRule: { position: 'absolute', left: 40, right: 40, bottom: 38, height: 0.5, backgroundColor: LINE },
  footerText: { position: 'absolute', left: 40, right: 110, bottom: 22, fontSize: 7.5, color: INK_3 },
  footerPage: { position: 'absolute', left: 40, right: 40, bottom: 22, textAlign: 'right', fontSize: 7.5, color: INK_3 },
  draft: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#7a4f00', backgroundColor: '#f9eed3', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 },
});

const T = ({ children, style }: { children: string; style?: object | object[] }) => <Text style={style as never}>{pdfText(children)}</Text>;

/**
 * A report section. The heading and the first `keep` blocks form one unbreakable
 * unit, so a heading (or a table header) is never left alone at the bottom of a page.
 */
function Section({ title, note, keep = 1, children }: { title: string; note?: string; keep?: number; children: ReactNode }) {
  const blocks = Children.toArray(children);
  return (
    <View style={s.section}>
      <View wrap={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T style={s.h2}>{title}</T>
          {note ? <T style={s.note}>{note}</T> : null}
        </View>
        {blocks.slice(0, keep)}
      </View>
      {blocks.slice(keep)}
    </View>
  );
}

const Bullets = ({ items }: { items: readonly string[] }) => (
  <View>
    {items.map((item) => (
      <View key={item} style={s.bullet} wrap={false}>
        <Text style={s.bulletDot}>•</Text>
        <T style={s.bulletText}>{item}</T>
      </View>
    ))}
  </View>
);

interface Column {
  label: string;
  flex: number;
  numeric?: boolean;
}

/**
 * Table rows as separate blocks (header, data rows, optional total), each unbreakable.
 * `keep` is how many of them should stay with the section heading: the whole table
 * when it is short, otherwise the header and the first three rows.
 */
function tableBlocks(columns: Column[], rows: string[][], footer?: string[]): { blocks: ReactNode[]; keep: number } {
  const cell = (text: string, c: Column, bold = false) => (
    <T key={c.label} style={[{ flex: c.flex, paddingRight: 4 }, c.numeric ? s.num : {}, bold ? { fontFamily: 'Helvetica-Bold' } : {}]}>
      {text}
    </T>
  );
  const blocks: ReactNode[] = [
    <View key="head" style={[s.row, { borderBottomColor: INK_3 }]} wrap={false}>
      {columns.map((c) => (
        <T key={c.label} style={[s.th, { flex: c.flex, paddingRight: 4 }, c.numeric ? s.num : {}]}>
          {c.label}
        </T>
      ))}
    </View>,
    ...rows.map((r, i) => (
      <View key={`row-${i}`} style={s.row} wrap={false}>
        {columns.map((c, n) => cell(r[n] ?? '', c))}
      </View>
    )),
  ];
  if (footer) {
    blocks.push(
      <View key="foot" style={[s.row, { borderBottomWidth: 0, borderTopWidth: 0.5, borderTopColor: INK_3 }]} wrap={false}>
        {columns.map((c, n) => cell(footer[n] ?? '', c, true))}
      </View>,
    );
  }
  return { blocks, keep: rows.length <= 8 ? blocks.length : 4 };
}

function Trend({ title, values, previous, dates, format }: { title: string; values: Array<number | null>; previous: Array<number | null>; dates: string[]; format: (v: number) => string }) {
  const g = trendGeometry(values, previous, { width: 250, height: 112 });
  return (
    <View style={{ width: 250 }}>
      <T style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5, marginBottom: 3 }}>{title}</T>
      <Svg width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`}>
        {g.yTicks.map((t) => (
          <Line key={`l${t.value}`} x1={g.plot.left} x2={g.plot.right} y1={t.y} y2={t.y} stroke={LINE} strokeWidth={0.6} />
        ))}
        {g.yTicks.map((t) => (
          <Text key={`t${t.value}`} x={g.plot.left - 4} y={t.y + 2.2} textAnchor="end" fill={INK_3} style={{ fontSize: 6.5 }}>
            {pdfText(format(t.value))}
          </Text>
        ))}
        {g.xLabels.map((l) => (
          <Text key={`x${l.index}`} x={l.x} y={g.height - 5} textAnchor={l.anchor} fill={INK_3} style={{ fontSize: 6.5 }}>
            {pdfText(formatDate(dates[l.index]!, { year: false }))}
          </Text>
        ))}
        {g.previous.map((d) => (
          <Path key={`p${d}`} d={d} stroke={CHART_2} strokeWidth={1} strokeDasharray="3 2" fill="none" />
        ))}
        {g.previousDots.map((p) => (
          <Circle key={`pd${p.x}`} cx={p.x} cy={p.y} r={1.2} fill={CHART_2} />
        ))}
        {g.current.map((d) => (
          <Path key={`c${d}`} d={d} stroke={CHART_1} strokeWidth={1.4} fill="none" />
        ))}
        {g.currentDots.map((p) => (
          <Circle key={`cd${p.x}`} cx={p.x} cy={p.y} r={1.5} fill={CHART_1} />
        ))}
      </Svg>
    </View>
  );
}

function paceLabel(b: BudgetPacing, tolerance: number): string {
  const p = b.pacing;
  if (p.phase === 'not_started') return 'Not started';
  const done = p.phase === 'complete';
  const variance = done ? (p.spendCents - p.budgetCents) / p.budgetCents : (p.projectedVariance ?? 0);
  if (variance >= tolerance) return done ? 'Finished over budget' : 'Projected over budget';
  if (variance <= -tolerance) return done ? 'Finished under budget' : 'Projected under budget';
  return done ? 'Finished within tolerance' : 'On pace';
}

export function ReportPdf({ title, commentary, sections, snapshot, status, finalizedAt }: ReportPdfInput) {
  const a = snapshot.analysis;
  const { client } = snapshot;
  const has = (id: ReportSectionId) => sections.includes(id);
  const money = (c: number | null) => formatMoney(c, client.currency, { code: client.currency === 'INR' });
  const compare = a.previousHasData;
  const days = daysInclusive(a.range.from, a.range.to);
  const dates = a.series.map((p) => p.date);
  const period = formatDateRange(a.range.from, a.range.to);
  const paragraphs = commentary.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const delta = (c: Change | RateChange, points = false) => (points && 'points' in c ? formatPoints(c) : formatChange(c));
  const symbol = client.currency === 'INR' ? '' : money(0).replace(/[\d.,\s]/g, '');
  const kpis: Array<{ label: string; value: string; prev: string; change: string }> = [
    { label: 'Spend', value: money(a.current.spendCents), prev: money(a.previous.spendCents), change: delta(a.comparison.spend) },
    { label: 'Conversions', value: formatCount(a.current.conversions), prev: formatCount(a.previous.conversions), change: delta(a.comparison.conversions) },
    { label: 'Cost per acquisition', value: money(a.current.cpaCents), prev: money(a.previous.cpaCents), change: delta(a.comparison.cpa) },
    { label: 'Reported revenue', value: money(a.current.revenueCents), prev: money(a.previous.revenueCents), change: delta(a.comparison.revenue) },
    { label: 'ROAS', value: formatRoas(a.current.roas), prev: formatRoas(a.previous.roas), change: delta(a.comparison.roas) },
    { label: 'Click-through rate', value: formatRate(a.current.ctr), prev: formatRate(a.previous.ctr), change: delta(a.comparison.ctr, true) },
    { label: 'Cost per click', value: money(a.current.cpcCents), prev: money(a.previous.cpcCents), change: delta(a.comparison.cpc) },
  ];

  const channelTable = tableBlocks(
    [{ label: 'Channel', flex: 2.2 }, ...['Spend', 'Share', 'Conversions', 'CPA', 'Revenue', 'ROAS', 'CTR'].map((label) => ({ label, flex: label === 'Share' || label === 'ROAS' || label === 'CTR' ? 0.9 : 1.4, numeric: true }))],
    a.channels.map((c) => [c.channel, money(c.current.spendCents), formatRate(c.spendShare, 0), formatCount(c.current.conversions), money(c.current.cpaCents), money(c.current.revenueCents), formatRoas(c.current.roas), formatRate(c.current.ctr)]),
    ['Total', money(a.current.spendCents), '100%', formatCount(a.current.conversions), money(a.current.cpaCents), money(a.current.revenueCents), formatRoas(a.current.roas), formatRate(a.current.ctr)],
  );
  const campaignTable = tableBlocks(
    [
                    { label: 'Campaign', flex: 3.4 },
                    { label: 'Spend', flex: 1.4, numeric: true },
                    ...(compare ? [{ label: 'vs previous', flex: 1.1, numeric: true }] : []),
                    { label: 'Conversions', flex: 1.2, numeric: true },
                    { label: 'CPA', flex: 1.2, numeric: true },
                    { label: 'ROAS', flex: 0.9, numeric: true },
                    { label: 'CTR', flex: 0.9, numeric: true },
                  ],
    a.campaigns.map((c) => [
                    `${c.campaign}\n${c.channel}`,
                    money(c.current.spendCents),
                    ...(compare ? [delta(c.comparison.spend)] : []),
                    formatCount(c.current.conversions),
                    money(c.current.cpaCents),
                    formatRoas(c.current.roas),
                    formatRate(c.current.ctr),
                  ]),
  );

  return (
    <Document title={pdfText(title)} author={pdfText(client.branding.preparedBy || snapshot.agencyName)} subject={pdfText(`${client.name}, ${period}`)} creator="CampaignLens" producer="CampaignLens">
      <Page size="A4" style={s.page}>
        <View style={{ height: 5, backgroundColor: client.branding.color, marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T style={[s.eyebrow, { color: client.branding.color }]}>{client.name}</T>
          {status === 'draft' ? <Text style={s.draft}>DRAFT, NOT FINAL</Text> : null}
        </View>
        <T style={s.title}>{title}</T>
        <T style={{ fontSize: 10, marginTop: 5 }}>{`${period} | ${pluralize(days, 'day')}${compare ? ` | compared with ${formatDateRange(a.previousRange.from, a.previousRange.to)}` : ''}`}</T>
        <T style={s.meta}>
          {`${client.branding.preparedBy ? `Prepared by ${client.branding.preparedBy}. ` : ''}Amounts in ${client.currency}. Dates are calendar days in ${client.timezone}. ${
            status === 'final' && finalizedAt ? `Finalized ${formatTimestamp(finalizedAt)}.` : `Data captured ${formatTimestamp(snapshot.generatedAt)}.`
          }`}
        </T>

        {a.current.rows === 0 ? (
          <Section title="No data for this period">
            <T>No campaign data had been imported for these dates when this report was created. That means the data is missing, not that nothing was spent.</T>
          </Section>
        ) : (
          <>
            {has('summary') ? (
              <Section title="Summary" note="Rule-based, generated from the figures in this report" keep={3}>
                <T style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 6 }}>{a.summary.headline}</T>
                <T style={[s.eyebrow, { marginBottom: 3 }]}>What the data shows</T>
                <Bullets items={a.summary.confident} />
                <T style={[s.eyebrow, { marginTop: 6, marginBottom: 3 }]}>Context for these figures</T>
                <Bullets items={a.summary.caveats} />
              </Section>
            ) : null}

            {paragraphs.length ? (
              <Section title="Commentary" note={client.branding.preparedBy ? `From ${client.branding.preparedBy}` : undefined} keep={(paragraphs[0]?.length ?? 0) <= 1200 ? 1 : 0}>
                {paragraphs.map((p, i) => (
                  <T key={i} style={{ marginBottom: 5, fontSize: 9.5 }}>
                    {p}
                  </T>
                ))}
              </Section>
            ) : null}

            {has('kpis') ? (
              <Section title="Key metrics" note={compare ? `Change is against the previous ${pluralize(days, 'day')}` : 'No previous-period data to compare'}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }} wrap={false}>
                  {kpis.map((k) => (
                    <View key={k.label} style={{ width: '25%', marginBottom: 9, paddingRight: 6 }}>
                      <T style={s.eyebrow}>{k.label}</T>
                      <T style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 3, marginBottom: 2 }}>{k.value}</T>
                      {compare ? <T style={s.note}>{`${k.change} from ${k.prev}`}</T> : null}
                    </View>
                  ))}
                </View>
              </Section>
            ) : null}

            {has('trend') ? (
              <Section title="Daily trend" note={compare ? 'Solid line: this period. Dashed line: previous period.' : undefined}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} wrap={false}>
                  <Trend
                    title={`Spend (${client.currency})`}
                    values={a.series.map((p) => (p.metrics ? p.metrics.spendCents / 100 : null))}
                    previous={compare ? a.previousSeries.map((p) => (p.metrics ? p.metrics.spendCents / 100 : null)) : []}
                    dates={dates}
                    format={(v) => axisLabel(v, symbol)}
                  />
                  <Trend title="Conversions" values={a.series.map((p) => p.metrics?.conversions ?? null)} previous={compare ? a.previousSeries.map((p) => p.metrics?.conversions ?? null) : []} dates={dates} format={(v) => axisLabel(v)} />
                </View>
                {!a.coverage.complete ? <T style={[s.note, { marginTop: 3 }]}>Gaps in a line are days with no imported data.</T> : null}
              </Section>
            ) : null}

            {has('channels') ? (
              <Section title="Channels" keep={channelTable.keep}>
                {channelTable.blocks}
              </Section>
            ) : null}

            {has('campaigns') ? (
              <Section title="Campaigns" note={`${pluralize(a.campaigns.length, 'campaign')}, by spend`} keep={campaignTable.keep}>
                {campaignTable.blocks}
              </Section>
            ) : null}

            {has('pacing') && a.pacing.length ? (
              <Section title="Budget pacing">
                {a.pacing.map((b) => {
                  const p = b.pacing;
                  const scale = Math.max(p.budgetCents, p.spendCents, p.projectedCents ?? 0) || 1;
                  return (
                    <View key={b.budgetId} style={s.card} wrap={false}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <T style={{ fontFamily: 'Helvetica-Bold' }}>{b.label}</T>
                        <T style={{ fontFamily: 'Helvetica-Bold', color: INK_2 }}>{paceLabel(b, snapshot.thresholds.pacingTolerancePct)}</T>
                      </View>
                      <T style={s.note}>{`${formatDateRange(p.period.from, p.period.to)} | ${p.phase === 'not_started' ? 'starts later' : `day ${p.elapsedDays} of ${p.totalDays}, as of ${formatDate(p.asOf)}`}`}</T>
                      <View style={{ height: 6, backgroundColor: SUNKEN, borderRadius: 3, marginTop: 5, marginBottom: 5 }}>
                        <View style={{ height: 6, width: `${Math.min(100, (p.spendCents / scale) * 100)}%`, backgroundColor: CHART_1, borderRadius: 3 }} />
                      </View>
                      <View style={{ flexDirection: 'row' }}>
                        {[
                          ['Budget', money(p.budgetCents)],
                          ['Observed spend', money(p.spendCents)],
                          ['Expected by now', money(p.expectedCents)],
                          [p.remainingCents >= 0 ? 'Remaining budget' : 'Over budget by', money(Math.abs(p.remainingCents))],
                          [p.phase === 'complete' ? 'Final spend' : 'Linear projection', money(p.projectedCents)],
                        ].map(([label, value]) => (
                          <View key={label} style={{ flex: 1 }}>
                            <T style={s.note}>{label!}</T>
                            <T style={{ fontFamily: 'Helvetica-Bold' }}>{value!}</T>
                          </View>
                        ))}
                      </View>
                      {p.phase === 'in_progress' ? (
                        <T style={[s.note, { marginTop: 4 }]}>
                          {`The projection is linear: average daily spend so far, continued for the remaining ${pluralize(p.remainingDays, 'day')}. It is not a forecast.${
                            b.elapsedDaysWithoutData > 0 ? ` ${pluralize(b.elapsedDaysWithoutData, 'elapsed day')} have no imported data, so observed spend may be understated.` : ''
                          }`}
                        </T>
                      ) : null}
                    </View>
                  );
                })}
              </Section>
            ) : null}

            {has('review') && a.queue.length ? (
              <Section title="Items under review" note="Observations we are checking, not conclusions">
                {a.queue.map((q) => (
                  <View key={q.id} style={s.card} wrap={false}>
                    <T style={{ fontFamily: 'Helvetica-Bold' }}>{`${KIND_LABEL[q.kind]}: ${q.title}`}</T>
                    <T style={[s.note, { marginTop: 2 }]}>{q.evidence.map((e) => `${e.label} ${e.current}${e.previous ? ` (previously ${e.previous}${e.change ? `, ${e.change}` : ''})` : ''}`).join(' | ')}</T>
                    <T style={{ marginTop: 3 }}>{`Next check: ${q.nextCheck}`}</T>
                  </View>
                ))}
              </Section>
            ) : null}

            {has('method') ? (
              <Section title="Method and data notes" keep={2}>
                <T style={[s.eyebrow, { marginBottom: 3 }]}>How figures are calculated</T>
                <Bullets items={METHOD_NOTES} />
                <T style={[s.eyebrow, { marginTop: 6, marginBottom: 3 }]}>Data in this report</T>
                <Bullets
                  items={[
                    `${formatCount(snapshot.provenance.rowCount)} campaign-day rows covering ${a.coverage.daysWithData} of ${pluralize(a.coverage.daysInRange, 'day')}${
                      a.coverage.channelGaps.length ? `; days are missing for ${a.coverage.channelGaps.map((g) => `${g.channel} (${g.missingDates.length})`).join(', ')}` : ''
                    }.`,
                    ...(client.conversionDefinition ? [`Conversion definition: ${client.conversionDefinition}`] : []),
                    `Data captured ${formatTimestamp(snapshot.generatedAt)}. Later imports do not change this report.`,
                    ...snapshot.provenance.imports.map(
                      (i) => `Source: ${i.source} (${i.fileName}), imported ${formatTimestamp(i.importedAt)}${i.coverageStart && i.coverageEnd ? `, covering ${formatDateRange(i.coverageStart, i.coverageEnd)}` : ''}.`,
                    ),
                  ]}
                />
              </Section>
            ) : null}
          </>
        )}

        <Text style={s.footerRule} fixed />
        <Text style={s.footerText} fixed>
          {pdfText(`${client.branding.footer ? `${client.branding.footer} ` : ''}${snapshot.agencyName} | ${client.name} | ${period}`)}
        </Text>
        <Text style={s.footerPage} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}

export const renderReportPdf = (input: ReportPdfInput): Promise<Buffer> => renderToBuffer(<ReportPdf {...input} />);

/** A safe download name such as "fernhill-outdoor-2026-10-01-to-2026-10-31.pdf". */
export function reportPdfFileName(snapshot: ReportSnapshot): string {
  const slug = snapshot.client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
  return `${slug}-${snapshot.analysis.range.from}-to-${snapshot.analysis.range.to}.pdf`;
}

export function pdfResponse(buffer: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
