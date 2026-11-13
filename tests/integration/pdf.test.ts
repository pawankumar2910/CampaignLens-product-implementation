import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import { pdfText, renderReportPdf, reportPdfFileName } from '@/lib/reports/pdf';
import { ALL_SECTION_IDS } from '@/lib/reports/snapshot';
import { createClient, listClients } from '@/lib/services/clients';
import { createDemoSandbox } from '@/lib/services/demo';
import { commitImport } from '@/lib/services/imports';
import { createReport, updateReport } from '@/lib/services/reports';
import { CLIENT_INPUT, csv, file, makeAgency, makeUser } from './helpers';

async function read(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return { pages: pdf.numPages, text: text as string[], all: (text as string[]).join('\n') };
}

describe('PDF export', () => {
  test('a full demo report renders every section with page numbers and keeps the snapshot figures', async () => {
    const guest = await makeUser('Pdf Guest');
    const actor = await createDemoSandbox({ userId: guest.id, userName: guest.name, email: guest.email }, new Date('2026-11-12T12:00:00Z'));
    const fernhill = (await listClients(actor)).find((c) => c.name === 'Fernhill Outdoor')!;
    const draft = await createReport(actor, fernhill.id, { from: '2026-10-13', to: '2026-11-11' }, new Date('2026-11-12T12:00:00Z'));
    const report = await updateReport(actor, fernhill.id, draft.id, { title: 'Fernhill Outdoor: autumn review', commentary: 'First paragraph.\n\nSecond paragraph.', sections: ALL_SECTION_IDS });

    const buffer = await renderReportPdf({ title: report.title, commentary: report.commentary, sections: report.sections, snapshot: report.snapshot, status: 'draft', finalizedAt: null });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    // Kept so the exported file can be opened and inspected by eye.
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/demo-report.pdf', buffer);

    const { pages, text, all } = await read(buffer);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(6);
    for (const heading of ['Summary', 'Commentary', 'Key metrics', 'Daily trend', 'Channels', 'Campaigns', 'Budget pacing', 'Items under review', 'Method and data notes']) expect(all).toContain(heading);
    expect(all).toContain('Fernhill Outdoor: autumn review');
    expect(all).toContain('DRAFT, NOT FINAL');
    expect(all).toContain('Second paragraph.');
    expect(all).toContain('13 Oct');
    expect(all).toContain('Rule-based');
    expect(all).toMatch(/not profit/);
    text.forEach((page, i) => expect(page).toContain(`Page ${i + 1} of ${pages}`));

    // Page-break control: no page may end on a section heading or a table header.
    const headings = ['Summary', 'Commentary', 'Key metrics', 'Daily trend', 'Channels', 'Campaigns', 'Budget pacing', 'Items under review', 'Method and data notes'];
    for (const page of text) {
      const lines = page.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^Fictional demo data|^Page \d+ of/.test(l));
      const last = lines.at(-1)!;
      expect(headings.some((h) => last.startsWith(h)), `page ends with a heading: ${last}`).toBe(false);
      expect(last).not.toMatch(/^(CHANNEL|CAMPAIGN) SPEND/);
    }

    // The spend figure in the PDF is the snapshot's figure, formatted by the shared formatter.
    const spend = (report.snapshot.analysis.current.spendCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
    expect(all).toContain(`$${spend}`);
    expect(reportPdfFileName(report.snapshot)).toBe('fernhill-outdoor-2026-10-13-to-2026-11-11.pdf');
  });

  test('only the chosen sections are included, and imported text is drawn as plain text', async () => {
    const { owner } = await makeAgency('Pdf Co');
    const client = await createClient(owner, CLIENT_INPUT);
    const hostile = '<script>alert(1)</script> & "quotes"';
    await commitImport(owner, client.id, file(csv(`2026-11-01,Google Ads,"${hostile.replace(/"/g, '""')}",USD,100,10000,200,10,500`)));
    const report = await createReport(owner, client.id, { from: '2026-11-01', to: '2026-11-01' });

    const buffer = await renderReportPdf({ title: 'Small report', commentary: '', sections: ['kpis', 'campaigns'], snapshot: report.snapshot, status: 'final', finalizedAt: '2026-11-12T10:00:00.000Z' });
    const { pages, all } = await read(buffer);
    expect(pages).toBe(1);
    expect(all).toContain('Key metrics');
    expect(all).toContain('<script>alert(1)</script> & "quotes"');
    expect(all).toContain('Finalized 12 Nov 2026');
    expect(all).not.toContain('DRAFT');
    for (const absent of ['Summary', 'Daily trend', 'Method and data notes', 'Commentary']) expect(all).not.toContain(absent);
  });

  test('text outside the built-in font range is replaced rather than corrupting the file', () => {
    expect(pdfText('Spend −5% – “ok” €5 £5')).toBe('Spend -5% – "ok" €5 £5');
    expect(pdfText('キャンペーン A')).toBe('?????? A');
  });
});
