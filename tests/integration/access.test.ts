import { describe, expect, test } from 'vitest';
import { sql } from 'drizzle-orm';
import { can, ForbiddenError, NotFoundError, PERMISSIONS, ValidationError } from '@/lib/auth/permissions';
import { getDb } from '@/lib/db/client';
import { campaignDays } from '@/lib/db/schema';
import { createBudget, deleteBudget } from '@/lib/services/budgets';
import { createClient, deleteClient, getClient, listClients, updateClient } from '@/lib/services/clients';
import { commitImport, getImport, listImports, previewImport } from '@/lib/services/imports';
import { acceptInvitation, createInvitation, listMembers, previewInvitation, removeMember, revokeInvitation, updateMemberRole } from '@/lib/services/members';
import { createReport, createShareLink, deleteReport, finalizeReport, getReport, listReports, listShareLinks, revokeShareLink, updateReport } from '@/lib/services/reports';
import { loadClientData } from '@/lib/services/workspace';
import { addMember, CLIENT_INPUT, file, makeAgency, makeUser, rowsOf, tenDays } from './helpers';

const NOV_BUDGET = { scope: 'client', channel: null, campaign: null, periodStart: '2026-11-01', periodEnd: '2026-11-30', amountCents: 500000 };

describe('database', () => {
  test('migrations create the schema and data persists', async () => {
    const db = await getDb();
    const tables = await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`);
    const names = rowsOf<{ table_name: string }>(tables).map((r) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(['agencies', 'budgets', 'campaign_days', 'clients', 'imports', 'invitations', 'memberships', 'reports', 'share_links', 'user', 'session', 'account', 'verification']));

    const { owner } = await makeAgency('Persist Co');
    const client = await createClient(owner, CLIENT_INPUT);
    await commitImport(owner, client.id, file(tenDays()));
    const data = await loadClientData(owner, client.id);
    expect(data.rows).toHaveLength(10);
    expect(data.rows[0]).toEqual({ date: '2026-11-01', channel: 'Google Ads', campaign: 'Brand', spendCents: 10000, impressions: 10000, clicks: 200, conversions: 10, revenueCents: 50000 });
    expect(data.bounds).toEqual({ from: '2026-11-01', to: '2026-11-10' });
  });

  test('the row grain is enforced by the database, not only by application code', async () => {
    const { owner } = await makeAgency('Grain Co');
    const client = await createClient(owner, CLIENT_INPUT);
    const db = await getDb();
    const row = { agencyId: owner.agencyId, clientId: client.id, date: '2026-11-01', channel: 'G', campaign: 'C', spendCents: 1, impressions: 1, clicks: 1, conversions: '0', revenueCents: 0 };
    await db.insert(campaignDays).values(row);
    await expect(db.insert(campaignDays).values(row)).rejects.toThrow();
  });
});

describe('role permissions are enforced in the service layer', () => {
  test('permission matrix', () => {
    expect(can('viewer', 'workspace:view')).toBe(true);
    for (const action of Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>) {
      if (action !== 'workspace:view') expect(can('viewer', action), action).toBe(false);
    }
    expect(can('analyst', 'data:import')).toBe(true);
    expect(can('analyst', 'client:delete')).toBe(false);
    expect(can('analyst', 'member:manage')).toBe(false);
    expect(can('owner', 'member:manage')).toBe(true);
  });

  test('a viewer can read but every write is refused', async () => {
    const { agency, owner } = await makeAgency('Roles Co');
    const viewer = await addMember(agency, 'viewer');
    const client = await createClient(owner, CLIENT_INPUT);
    await commitImport(owner, client.id, file(tenDays()));
    const report = await createReport(owner, client.id, { from: '2026-11-01', to: '2026-11-10' });
    await finalizeReport(owner, client.id, report.id);
    const budget = await createBudget(owner, client.id, NOV_BUDGET);

    expect((await listClients(viewer)).map((c) => c.name)).toEqual(['Acme Outdoor']);
    expect((await loadClientData(viewer, client.id)).rows).toHaveLength(10);
    expect((await getReport(viewer, client.id, report.id)).status).toBe('final');

    const writes: Array<() => Promise<unknown>> = [
      () => createClient(viewer, { ...CLIENT_INPUT, name: 'Other' }),
      () => updateClient(viewer, client.id, {}),
      () => deleteClient(viewer, client.id, client.name),
      () => previewImport(viewer, client.id, file(tenDays())),
      () => commitImport(viewer, client.id, file(tenDays())),
      () => createBudget(viewer, client.id, NOV_BUDGET),
      () => deleteBudget(viewer, client.id, budget.id),
      () => createReport(viewer, client.id, { from: '2026-11-01', to: '2026-11-10' }),
      () => updateReport(viewer, client.id, report.id, {}),
      () => deleteReport(viewer, client.id, report.id),
      () => createShareLink(viewer, client.id, report.id, { expiresInDays: 7 }),
      () => createInvitation(viewer, { email: 'x@example.test', role: 'viewer' }),
    ];
    for (const write of writes) await expect(write()).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listClients(owner))).toHaveLength(1);
  });

  test('an analyst can do the reporting work but not owner-only actions', async () => {
    const { agency, owner } = await makeAgency('Analyst Co');
    const analyst = await addMember(agency, 'analyst');
    const client = await createClient(analyst, CLIENT_INPUT);
    await commitImport(analyst, client.id, file(tenDays()));
    await createBudget(analyst, client.id, NOV_BUDGET);
    await expect(deleteClient(analyst, client.id, client.name)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createInvitation(analyst, { email: 'x@example.test', role: 'viewer' })).rejects.toBeInstanceOf(ForbiddenError);
    const [ownerMembership] = await listMembers(owner);
    await expect(updateMemberRole(analyst, ownerMembership!.membershipId, 'viewer')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('agencies are isolated from each other', () => {
  test('another agency cannot read, change or even detect a client and its records', async () => {
    const a = await makeAgency('Agency A');
    const b = await makeAgency('Agency B');
    const client = await createClient(a.owner, CLIENT_INPUT);
    const imported = await commitImport(a.owner, client.id, file(tenDays()));
    const budget = await createBudget(a.owner, client.id, NOV_BUDGET);
    const report = await createReport(a.owner, client.id, { from: '2026-11-01', to: '2026-11-10' });
    await finalizeReport(a.owner, client.id, report.id);
    const { link } = await createShareLink(a.owner, client.id, report.id, { expiresInDays: 7 });

    expect(await listClients(b.owner)).toEqual([]);

    // Agency B is an owner of its own agency, so these fail on scoping, not on role.
    const attempts: Array<() => Promise<unknown>> = [
      () => getClient(b.owner, client.id),
      () => loadClientData(b.owner, client.id),
      () => updateClient(b.owner, client.id, { name: 'Hijacked', timezone: 'UTC', conversionDefinition: '', branding: client.branding, thresholds: client.thresholds }),
      () => deleteClient(b.owner, client.id, client.name),
      () => previewImport(b.owner, client.id, file(tenDays())),
      () => commitImport(b.owner, client.id, file(tenDays())),
      () => listImports(b.owner, client.id),
      () => getImport(b.owner, client.id, imported.id),
      () => createBudget(b.owner, client.id, { ...NOV_BUDGET, periodStart: '2026-12-01', periodEnd: '2026-12-31' }),
      () => deleteBudget(b.owner, client.id, budget.id),
      () => listReports(b.owner, client.id),
      () => getReport(b.owner, client.id, report.id),
      () => createReport(b.owner, client.id, { from: '2026-11-01', to: '2026-11-10' }),
      () => deleteReport(b.owner, client.id, report.id),
      () => listShareLinks(b.owner, client.id, report.id),
      () => createShareLink(b.owner, client.id, report.id, { expiresInDays: 7 }),
      () => revokeShareLink(b.owner, client.id, report.id, link.id),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);

    // Mixing ids across agencies also fails: B's own client with A's report, budget or import.
    const own = await createClient(b.owner, CLIENT_INPUT);
    await expect(getReport(b.owner, own.id, report.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteBudget(b.owner, own.id, budget.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getImport(b.owner, own.id, imported.id)).rejects.toBeInstanceOf(NotFoundError);

    // Agency A's data is untouched.
    const data = await loadClientData(a.owner, client.id);
    expect(data.client.name).toBe('Acme Outdoor');
    expect(data.rows).toHaveLength(10);
    expect(data.budgets).toHaveLength(1);
  });

  test('malformed ids are treated as not found rather than reaching the database', async () => {
    const { owner } = await makeAgency('Ids Co');
    await expect(getClient(owner, "1' or '1'='1")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getClient(owner, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundError);
  });

  test('client names are unique per agency, not globally', async () => {
    const a = await makeAgency('Names A');
    const b = await makeAgency('Names B');
    await createClient(a.owner, CLIENT_INPUT);
    await expect(createClient(a.owner, { ...CLIENT_INPUT, name: 'acme outdoor' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createClient(b.owner, CLIENT_INPUT)).resolves.toMatchObject({ name: 'Acme Outdoor' });
  });
});

describe('client settings', () => {
  test('validation, and currency is locked once data exists', async () => {
    const { owner } = await makeAgency('Settings Co');
    await expect(createClient(owner, { name: '', currency: 'USD', timezone: 'UTC' })).rejects.toThrow(/client name/i);
    await expect(createClient(owner, { name: 'X', currency: 'BTC', timezone: 'UTC' })).rejects.toThrow(/currency/i);
    await expect(createClient(owner, { name: 'X', currency: 'USD', timezone: 'Mars/Olympus' })).rejects.toThrow(/timezone/i);

    const client = await createClient(owner, CLIENT_INPUT);
    const patch = { name: client.name, timezone: client.timezone, conversionDefinition: 'Purchases', branding: client.branding, thresholds: client.thresholds };
    expect((await updateClient(owner, client.id, { ...patch, currency: 'EUR' })).currency).toBe('EUR');
    await commitImport(owner, client.id, file(tenDays().replaceAll('USD', 'EUR')));
    await expect(updateClient(owner, client.id, { ...patch, currency: 'GBP' })).rejects.toThrow(/Currency cannot be changed/);
    await expect(updateClient(owner, client.id, { ...patch, thresholds: { ...client.thresholds, minConversions: 0 } })).rejects.toBeInstanceOf(ValidationError);
  });

  test('deleting a client needs its exact name and removes its data', async () => {
    const { owner } = await makeAgency('Delete Co');
    const client = await createClient(owner, CLIENT_INPUT);
    await commitImport(owner, client.id, file(tenDays()));
    await expect(deleteClient(owner, client.id, 'acme')).rejects.toBeInstanceOf(ValidationError);
    await deleteClient(owner, client.id, 'Acme Outdoor');
    await expect(getClient(owner, client.id)).rejects.toBeInstanceOf(NotFoundError);
    const db = await getDb();
    const left = await db.execute(sql`select count(*)::int as n from campaign_days where client_id = ${client.id}`);
    expect(rowsOf<{ n: number }>(left)[0]!.n).toBe(0);
  });
});

describe('membership and invitations', () => {
  test('an invitation works once, only for the invited email, and can be revoked', async () => {
    const { owner } = await makeAgency('Invite Co');
    const invited = await makeUser('Invited Person');
    const stranger = await makeUser('Stranger');
    const { token } = await createInvitation(owner, { email: invited.email.toUpperCase(), role: 'analyst' });

    expect(await previewInvitation(token)).toMatchObject({ agencyName: 'Invite Co', role: 'analyst' });
    await expect(acceptInvitation({ userId: stranger.id, email: stranger.email }, token)).rejects.toBeInstanceOf(ForbiddenError);
    await acceptInvitation({ userId: invited.id, email: invited.email }, token);
    expect((await listMembers(owner)).map((m) => m.role)).toEqual(['owner', 'analyst']);
    await expect(acceptInvitation({ userId: invited.id, email: invited.email }, token)).rejects.toBeInstanceOf(NotFoundError);
    expect(await previewInvitation(token)).toBeNull();

    const second = await createInvitation(owner, { email: 'later@example.test', role: 'viewer' });
    expect(await previewInvitation(second.token, new Date(Date.now() + 8 * 86_400_000))).toBeNull(); // expired after 7 days
    const db = await getDb();
    const open = await db.execute(sql`select id from invitations where email = 'later@example.test'`);
    await revokeInvitation(owner, rowsOf<{ id: string }>(open)[0]!.id);
    expect(await previewInvitation(second.token)).toBeNull();
    await expect(createInvitation(owner, { email: invited.email, role: 'viewer' })).rejects.toThrow(/already a member/);
  });

  test('an agency always keeps at least one owner', async () => {
    const { agency, owner } = await makeAgency('Owner Co');
    const analyst = await addMember(agency, 'analyst');
    const members = await listMembers(owner);
    const ownerRow = members.find((m) => m.userId === owner.userId)!;
    const analystRow = members.find((m) => m.userId === analyst.userId)!;
    await expect(updateMemberRole(owner, ownerRow.membershipId, 'viewer')).rejects.toThrow(/at least one owner/);
    await expect(removeMember(owner, ownerRow.membershipId)).rejects.toThrow(/only owner/);
    await updateMemberRole(owner, analystRow.membershipId, 'owner');
    await updateMemberRole(owner, ownerRow.membershipId, 'viewer');
    expect((await listMembers(analyst)).map((m) => m.role).sort()).toEqual(['owner', 'viewer']);
  });
});
