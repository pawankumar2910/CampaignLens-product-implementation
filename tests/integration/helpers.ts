import { randomUUID } from 'node:crypto';
import type { Actor } from '@/lib/auth/permissions';
import { getDb } from '@/lib/db/client';
import { agencies, memberships, user, type Role } from '@/lib/db/schema';
import type { ImportMapping } from '@/lib/import/mapping';

export const HEADER = 'date,channel,campaign,currency,spend,impressions,clicks,conversions,revenue';
export const csv = (...lines: string[]) => `${HEADER}\n${lines.join('\n')}`;
export const CANONICAL: ImportMapping = {
  columns: { date: 'date', channel: 'channel', campaign: 'campaign', currency: 'currency', spend: 'spend', impressions: 'impressions', clicks: 'clicks', conversions: 'conversions', revenue: 'revenue' },
  fixedChannel: null,
  dateFormat: 'YYYY-MM-DD',
};

export const file = (text: string, extra: Record<string, unknown> = {}) => ({
  text,
  fileName: 'export.csv',
  mapping: CANONICAL,
  source: 'Test export',
  conflictPolicy: null,
  acceptRejected: false,
  ...extra,
});

export async function makeUser(name: string): Promise<{ id: string; name: string; email: string }> {
  const db = await getDb();
  const record = { id: randomUUID(), name, email: `${name.toLowerCase().replace(/\W+/g, '.')}.${randomUUID().slice(0, 8)}@example.test` };
  await db.insert(user).values(record);
  return record;
}

export async function addMember(agency: { id: string; name: string }, role: Role, name = `${role} user`): Promise<Actor> {
  const db = await getDb();
  const u = await makeUser(name);
  await db.insert(memberships).values({ agencyId: agency.id, userId: u.id, role });
  return { userId: u.id, userName: u.name, email: u.email, agencyId: agency.id, agencyName: agency.name, role, isDemo: false };
}

/** A fresh agency with an owner. Each test builds its own, so tests never share data. */
export async function makeAgency(name: string): Promise<{ agency: { id: string; name: string }; owner: Actor }> {
  const db = await getDb();
  const [agency] = await db.insert(agencies).values({ name }).returning();
  const owner = await addMember(agency!, 'owner', `${name} owner`);
  return { agency: agency!, owner };
}

export const CLIENT_INPUT = { name: 'Acme Outdoor', currency: 'USD', timezone: 'America/New_York' };

/** Ten days of one campaign: spend 100/day, 10 conversions/day, revenue 500/day. */
export const tenDays = (channel = 'Google Ads', campaign = 'Brand', month = '2026-11') =>
  csv(...Array.from({ length: 10 }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')},${channel},${campaign},USD,100,10000,200,10,500`));

/** Rows from a raw `db.execute(sql...)` call; both drivers return `{ rows }`. */
export const rowsOf = <T>(result: unknown): T[] => (result as { rows: T[] }).rows;
