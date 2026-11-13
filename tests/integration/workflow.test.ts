import { describe, expect, test } from 'vitest';
import { sql } from 'drizzle-orm';
import { ValidationError } from '@/lib/auth/permissions';
import { getDb } from '@/lib/db/client';
import { buildDemoClients, DEMO_END, DEMO_START } from '@/lib/demo/data';
import { createBudget } from '@/lib/services/budgets';
import { createClient, listClients } from '@/lib/services/clients';
import { cleanupExpiredDemos, createDemoSandbox } from '@/lib/services/demo';
import { commitImport, getImport, listImports, previewImport } from '@/lib/services/imports';
import {
  createReport, createShareLink, deleteReport, duplicateReport, finalizeReport, getReport, listReports, listShareLinks, refreshReportSnapshot, resolveSharedReport, revokeShareLink,
  shareLinkState, updateReport,
} from '@/lib/services/reports';
import { analyzeClient, loadClientData, resolveRange } from '@/lib/services/workspace';
import { CLIENT_INPUT, csv, file, makeAgency, makeUser, rowsOf, tenDays } from './helpers';

const RANGE = { from: '2026-11-01', to: '2026-11-10' };

describe('imports', () => {
  test('preview writes nothing; commit records provenance, counts and coverage', async () => {
    const { owner } = await makeAgency('Import Co');
    const client = await createClient(owner, CLIENT_INPUT);

    const preview = await previewImport(owner, client.id, file(tenDays()));
    expect(preview).toMatchObject({ ok: true, preview: { rowsInFile: 10, validRows: 10, rejectedRows: 0, plan: { inserts: 10, unchanged: 0, conflicts: 0 }, coverage: RANGE, previousImportOfSameFile: null } });
    expect((await loadClientData(owner, client.id)).rows).toHaveLength(0);

    const record = await commitImport(owner, client.id, file(tenDays(), { fileName: 'google-nov.csv', source: 'Google Ads campaign report' }));
    expect(record).toMatchObject({
      fileName: 'google-nov.csv', source: 'Google Ads campaign report', rowsInFile: 10, inserted: 10, replaced: 0, unchanged: 0, rejected: 0,
      coverageStart: '2026-11-01', coverageEnd: '2026-11-10', currency: 'USD', timezone: 'America/New_York', createdByName: owner.userName,
    });
    expect(record.createdAt).toBeInstanceOf(Date);
    expect((await listImports(owner, client.id)).map((i) => i.id)).toEqual([record.id]);
  });

  test('importing the same file again is a no-op and is recognised as a repeat', async () => {
    const { owner } = await makeAgency('Repeat Co');
    const client = await createClient(owner, CLIENT_INPUT);
    await commitImport(owner, client.id, file(tenDays()));

    const preview = await previewImport(owner, client.id, file(tenDays()));
    expect(preview.ok && preview.preview.plan).toEqual({ inserts: 0, unchanged: 10, conflicts: 0 });
    expect(preview.ok && preview.preview.previousImportOfSameFile).toMatchObject({ by: owner.userName });

    const again = await commitImport(owner, client.id, file(tenDays()));
    expect(again).toMatchObject({ inserted: 0, unchanged: 10, replaced: 0 });
    const data = await loadClientData(owner, client.id);
    expect(data.rows).toHaveLength(10);
    expect(analyzeClient(data, RANGE).current.spendCents).toBe(100000);
  });

  test('changed values need an explicit decision: replace or keep', async () => {
    const { owner } = await makeAgency('Conflict Co');
    const client = await createClient(owner, CLIENT_INPUT);
    await commitImport(owner, client.id, file(tenDays()));
    // Restate day 1 (spend 100 -> 150) and add day 11.
    const restated = csv('2026-11-01,Google Ads,Brand,USD,150,10000,200,10,500', '2026-11-11,Google Ads,Brand,USD,100,10000,200,10,500');

    const preview = await previewImport(owner, client.id, file(restated));
    expect(preview.ok && preview.preview.plan).toEqual({ inserts: 1, unchanged: 0, conflicts: 1 });
    expect(preview.ok && preview.preview.conflictSample[0]).toMatchObject({ date: '2026-11-01', changed: ['spend'], existingSpendCents: 10000, incomingSpendCents: 15000 });

    await expect(commitImport(owner, client.id, file(restated))).rejects.toThrow(/Choose whether to replace/);
    expect((await loadClientData(owner, client.id)).rows).toHaveLength(10); // nothing was written

    const kept = await commitImport(owner, client.id, file(restated, { conflictPolicy: 'keep' }));
    expect(kept).toMatchObject({ inserted: 1, keptExisting: 1, replaced: 0 });
    expect((await loadClientData(owner, client.id)).rows[0]!.spendCents).toBe(10000);

    const replaced = await commitImport(owner, client.id, file(restated, { conflictPolicy: 'replace' }));
    expect(replaced).toMatchObject({ inserted: 0, unchanged: 1, replaced: 1 });
    const rows = (await loadClientData(owner, client.id)).rows;
    expect(rows).toHaveLength(11);
    expect(rows[0]!.spendCents).toBe(15000);
  });

  test('invalid rows are never dropped silently', async () => {
    const { owner } = await makeAgency('Invalid Co');
    const client = await createClient(owner, CLIENT_INPUT);
    const mixed = csv(
      '2026-11-01,Google Ads,Brand,USD,100,10000,200,10,500',
      '2026-11-02,Google Ads,Brand,USD,,10000,200,10,500', // blank spend
      '2026-13-03,Google Ads,Brand,USD,100,10000,200,10,500', // invalid date
      '2026-11-04,Google Ads,Brand,EUR,100,10000,200,10,500', // wrong currency
    );
    const preview = await previewImport(owner, client.id, file(mixed));
    expect(preview.ok && preview.preview).toMatchObject({ rowsInFile: 4, validRows: 1, rejectedRows: 3, errorCount: 3 });

    await expect(commitImport(owner, client.id, file(mixed))).rejects.toThrow(/3 row\(s\) have errors/);
    expect((await loadClientData(owner, client.id)).rows).toHaveLength(0);

    const record = await commitImport(owner, client.id, file(mixed, { acceptRejected: true }));
    expect(record).toMatchObject({ inserted: 1, rejected: 3, errorCount: 3 });
    const stored = await getImport(owner, client.id, record.id);
    expect(stored.issues.filter((i) => i.severity === 'error').map((i) => [i.line, i.code])).toEqual([[3, 'missing'], [4, 'invalid_date'], [5, 'currency_mismatch']]);
  });

  test('a structurally broken file and a file with no valid rows are refused', async () => {
    const { owner } = await makeAgency('Broken Co');
    const client = await createClient(owner, CLIENT_INPUT);
    expect(await previewImport(owner, client.id, file(csv('2026-11-01,"Google Ads,Brand,USD,1,1,1,1,1')))).toMatchObject({ ok: false, fatal: expect.stringMatching(/never closed/) });
    await expect(commitImport(owner, client.id, file(csv('2026-11-01,Google Ads,Brand,USD,-5,1,1,1,1'), { acceptRejected: true }))).rejects.toBeInstanceOf(ValidationError);
    expect(await listImports(owner, client.id)).toHaveLength(0);
  });

  test('imported text is stored as data, whatever it contains', async () => {
    const { owner } = await makeAgency('Text Co');
    const client = await createClient(owner, CLIENT_INPUT);
    const hostile = `<img src=x onerror=alert(1)> '; DROP TABLE clients;--`;
    await commitImport(owner, client.id, file(csv(`2026-11-01,Google Ads,"${hostile}",USD,100,10000,200,10,500`)));
    const data = await loadClientData(owner, client.id);
    expect(data.rows[0]!.campaign).toBe(hostile);
    expect(await listClients(owner)).toHaveLength(1);
  });
});

describe('analysis from stored data', () => {
  test('hand-calculated period comparison through the database', async () => {
    const { owner } = await makeAgency('Analysis Co');
    const client = await createClient(owner, CLIENT_INPUT);
    // Previous period (22-31 Oct): 10 days x spend 80, 8 conversions. Current (1-10 Nov): 10 days x spend 100, 10 conversions.
    const october = csv(...Array.from({ length: 10 }, (_, i) => `2026-10-${22 + i},Google Ads,Brand,USD,80,8000,160,8,400`));
    await commitImport(owner, client.id, file(october));
    await commitImport(owner, client.id, file(tenDays()));
    await createBudget(owner, client.id, { scope: 'client', channel: null, campaign: null, periodStart: '2026-11-01', periodEnd: '2026-11-30', amountCents: 600000 });

    const data = await loadClientData(owner, client.id);
    const a = analyzeClient(data, resolveRange(data, RANGE));
    expect(a.previousRange).toEqual({ from: '2026-10-22', to: '2026-10-31' });
    expect(a.current.spendCents).toBe(100000);
    expect(a.previous.spendCents).toBe(80000);
    expect(a.comparison.spend.pct).toBeCloseTo(0.25);
    expect(a.current.cpaCents).toBe(1000);
    expect(a.comparison.cpa.pct).toBe(0);
    expect(a.current.roas).toBe(5);
    expect(a.coverage.complete).toBe(true);
    // Budget 6000 for 30 days, 1000 spent after 10 days: expected 2000, projected 3000 (50% under).
    expect(a.pacing[0]!.pacing).toMatchObject({ expectedCents: 200000, projectedCents: 300000, elapsedDays: 10, totalDays: 30 });
    expect(a.queue.map((q) => q.kind)).toEqual(['pacing']);
    expect(a.queue[0]!.title).toMatch(/50% under budget/);
  });

  test('the default range is the last 30 days that have data', async () => {
    const { owner } = await makeAgency('Range Co');
    const client = await createClient(owner, CLIENT_INPUT);
    await commitImport(owner, client.id, file(tenDays()));
    const data = await loadClientData(owner, client.id);
    expect(resolveRange(data, {})).toEqual({ from: '2026-10-12', to: '2026-11-10' });
    expect(resolveRange(data, { from: '2026-11-05', to: '2026-11-01' })).toEqual({ from: '2026-10-12', to: '2026-11-10' });
    expect(resolveRange(data, { from: '2026-11-02', to: '2026-11-04' })).toEqual({ from: '2026-11-02', to: '2026-11-04' });
  });
});

describe('reports and sharing', () => {
  async function setup(name: string) {
    const { owner } = await makeAgency(name);
    const client = await createClient(owner, CLIENT_INPUT);
    await commitImport(owner, client.id, file(tenDays()));
    const report = await createReport(owner, client.id, RANGE);
    return { owner, client, report };
  }

  test('a draft can be edited and refreshed; a finalized report is frozen', async () => {
    const { owner, client, report } = await setup('Report Co');
    expect(report).toMatchObject({ status: 'draft', title: 'Acme Outdoor: 1 Nov – 10 Nov 2026' });
    expect(report.snapshot.analysis.current.spendCents).toBe(100000);

    const edited = await updateReport(owner, client.id, report.id, { title: 'November review', commentary: 'Steady month.', sections: ['summary', 'kpis'] });
    expect(edited).toMatchObject({ title: 'November review', commentary: 'Steady month.', sections: ['summary', 'kpis'] });
    await expect(updateReport(owner, client.id, report.id, { title: 'x', commentary: '', sections: ['nonsense'] })).rejects.toBeInstanceOf(ValidationError);

    // New data arrives: a second campaign for the same dates.
    await commitImport(owner, client.id, file(tenDays('Meta Ads', 'Prospecting')));
    expect((await getReport(owner, client.id, report.id)).snapshot.analysis.current.spendCents).toBe(100000); // unchanged until refreshed
    expect((await refreshReportSnapshot(owner, client.id, report.id)).snapshot.analysis.current.spendCents).toBe(200000);

    const final = await finalizeReport(owner, client.id, report.id);
    expect(final.status).toBe('final');
    expect(final.finalizedAt).toBeInstanceOf(Date);
    await commitImport(owner, client.id, file(tenDays('TikTok Ads', 'Test')));
    expect((await getReport(owner, client.id, report.id)).snapshot.analysis.current.spendCents).toBe(200000); // frozen
    await expect(updateReport(owner, client.id, report.id, { title: 'x', commentary: '', sections: ['summary'] })).rejects.toThrow(/finalized/);
    await expect(refreshReportSnapshot(owner, client.id, report.id)).rejects.toThrow(/finalized/);

    const copy = await duplicateReport(owner, client.id, report.id);
    expect(copy).toMatchObject({ status: 'draft', title: 'November review (copy)', commentary: 'Steady month.' });
    expect(copy.snapshot.analysis.current.spendCents).toBe(300000);
    expect((await listReports(owner, client.id)).map((r) => r.status).sort()).toEqual(['draft', 'final']);
  });

  test('only finalized reports can be shared, and the token is stored only as a hash', async () => {
    const { owner, client, report } = await setup('Share Co');
    await expect(createShareLink(owner, client.id, report.id, { expiresInDays: 7 })).rejects.toThrow(/Finalize the report/);
    await finalizeReport(owner, client.id, report.id);
    await expect(createShareLink(owner, client.id, report.id, { expiresInDays: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(createShareLink(owner, client.id, report.id, { expiresInDays: 365 })).rejects.toBeInstanceOf(ValidationError);

    const { token, link } = await createShareLink(owner, client.id, report.id, { expiresInDays: 7 });
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(link.tokenHash).not.toContain(token);
    const db = await getDb();
    const stored = await db.execute(sql`select count(*)::int as n from share_links where token_hash = ${token}`);
    expect(rowsOf<{ n: number }>(stored)[0]!.n).toBe(0);
  });

  test('a share link exposes the snapshot only, and stops working when expired or revoked', async () => {
    const { owner, client, report } = await setup('Link Co');
    await updateReport(owner, client.id, report.id, { title: 'Shared review', commentary: 'For the client.', sections: ['summary', 'kpis'] });
    await finalizeReport(owner, client.id, report.id);
    const created = new Date('2026-11-12T10:00:00Z');
    const { token, link } = await createShareLink(owner, client.id, report.id, { expiresInDays: 7 }, created);

    const shared = await resolveSharedReport(token, created);
    expect(shared).toMatchObject({ title: 'Shared review', commentary: 'For the client.', sections: ['summary', 'kpis'] });
    expect(shared!.snapshot.analysis.current.spendCents).toBe(100000);
    // Nothing that identifies or addresses the workspace leaves with the shared payload.
    const payload = JSON.stringify(shared);
    for (const secret of [owner.agencyId, client.id, report.id, link.id, owner.userId, owner.email, link.tokenHash]) expect(payload).not.toContain(secret);

    expect(await resolveSharedReport(`${token}x`, created)).toBeNull();
    expect(await resolveSharedReport('', created)).toBeNull();
    expect(await resolveSharedReport(token, new Date('2026-11-19T09:59:59Z'))).not.toBeNull();
    expect(await resolveSharedReport(token, new Date('2026-11-19T10:00:00Z'))).toBeNull(); // expired exactly at 7 days
    expect(shareLinkState(link, new Date('2026-11-20T00:00:00Z'))).toBe('expired');

    await revokeShareLink(owner, client.id, report.id, link.id);
    expect(await resolveSharedReport(token, created)).toBeNull();
    expect((await listShareLinks(owner, client.id, report.id)).map((l) => shareLinkState(l, created))).toEqual(['revoked']);
  });

  test('deleting a report invalidates its share links', async () => {
    const { owner, client, report } = await setup('Gone Co');
    await finalizeReport(owner, client.id, report.id);
    const { token } = await createShareLink(owner, client.id, report.id, { expiresInDays: 7 });
    expect(await resolveSharedReport(token)).not.toBeNull();
    await deleteReport(owner, client.id, report.id);
    expect(await resolveSharedReport(token)).toBeNull();
  });
});

describe('demo sandbox', () => {
  test('the synthetic dataset is deterministic and covers about 90 days', () => {
    const first = buildDemoClients();
    expect(buildDemoClients()).toEqual(first);
    expect(first.map((c) => [c.name, c.currency])).toEqual([['Fernhill Outdoor', 'USD'], ['Brightside Dental Group', 'USD'], ['Kettle & Loom', 'GBP']]);
    for (const c of first) {
      const dates = c.rows.map((r) => r.date).sort();
      expect(dates[0]).toBe(DEMO_START);
      expect(dates.at(-1)).toBe(DEMO_END);
      expect(c.rows.every((r) => r.clicks <= r.impressions && r.spendCents >= 0)).toBe(true);
      expect(new Set(c.rows.map((r) => `${r.date}|${r.channel}|${r.campaign}`)).size).toBe(c.rows.length);
    }
  });

  test('each visitor gets an isolated sandbox with recognisable patterns, and expired sandboxes are removed', async () => {
    const visitor = await makeUser('Guest One');
    const other = await makeUser('Guest Two');
    const now = new Date('2026-11-12T12:00:00Z');
    const actor = await createDemoSandbox({ userId: visitor.id, userName: visitor.name, email: visitor.email }, now);
    const otherActor = await createDemoSandbox({ userId: other.id, userName: other.name, email: other.email }, now);
    expect(actor.isDemo).toBe(true);
    expect(actor.agencyId).not.toBe(otherActor.agencyId);

    const clients = await listClients(actor);
    expect(clients.map((c) => c.name)).toEqual(['Brightside Dental Group', 'Fernhill Outdoor', 'Kettle & Loom']);
    const fernhill = clients.find((c) => c.name === 'Fernhill Outdoor')!;
    await expect(loadClientData(otherActor, fernhill.id)).rejects.toThrow(/not found/i);

    const data = await loadClientData(actor, fernhill.id, now);
    const analysis = analyzeClient(data, resolveRange(data, {}));
    expect(analysis.range).toEqual({ from: '2026-10-13', to: '2026-11-11' });
    const kinds = new Set(analysis.queue.map((q) => `${q.kind}:${q.campaign ?? q.subject}`));
    expect(kinds).toContain('cpa_deterioration:Prospecting: lookalike');
    expect(kinds).toContain('spend_change:Retargeting: cart abandoners');
    expect(kinds).toContain('spend_change:Autumn sale launch');
    expect(kinds).toContain('spend_change:Display remarketing');
    expect(analysis.queue.some((q) => q.kind === 'pacing' && q.priority === 'high')).toBe(true);
    expect(analysis.queue.find((q) => q.campaign === 'Autumn sale launch')!.title).toMatch(/New activity/);

    const dental = clients.find((c) => c.name === 'Brightside Dental Group')!;
    const dentalData = await loadClientData(actor, dental.id, now);
    const dentalAnalysis = analyzeClient(dentalData, resolveRange(dentalData, {}));
    expect(dentalAnalysis.queue[0]).toMatchObject({ kind: 'missing_dates', channel: 'Meta Ads' });
    expect(dentalAnalysis.current.roas).toBe(0);
    expect(dentalAnalysis.summary.caveats.join(' ')).toMatch(/No revenue was reported/);

    expect((await listReports(actor, fernhill.id)).map((r) => r.status)).toEqual(['final']);

    expect(await cleanupExpiredDemos(new Date('2026-11-12T13:00:00Z'))).toMatchObject({ agencies: 0 });
    const removed = await cleanupExpiredDemos(new Date('2026-11-14T12:00:00Z'));
    expect(removed.agencies).toBeGreaterThanOrEqual(2);
    await expect(listClients(actor)).resolves.toEqual([]);
  });
});
