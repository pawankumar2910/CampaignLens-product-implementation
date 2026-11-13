import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CURRENCIES, DEFAULT_THRESHOLDS, isValidTimeZone, type Thresholds } from '../analytics';
import { assertCan, NotFoundError, ValidationError, type Actor } from '../auth/permissions';
import { getDb, type Db, type Tx } from '../db/client';
import { campaignDays, clients, type ClientBranding, type ClientRow } from '../db/schema';

export const DEFAULT_BRAND_COLOR = '#1B4D3E';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string): boolean => UUID.test(v);

/** First validation message, phrased for the person filling in the form. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Invalid input.');
  return result.data;
}

const name = z.string().trim().min(1, 'Enter a client name.').max(80, 'Client name must be 80 characters or fewer.');
const timezone = z.string().refine(isValidTimeZone, 'Choose a valid reporting timezone.');
const currency = z.enum(CURRENCIES as [string, ...string[]], { error: 'Choose a supported currency.' });

const brandingSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Brand colour must be a hex value such as #1B4D3E.'),
  preparedBy: z.string().trim().max(80, 'Prepared-by name must be 80 characters or fewer.'),
  footer: z.string().trim().max(200, 'Footer must be 200 characters or fewer.'),
});

const pct = (label: string) => z.number({ error: `${label} must be a number.` }).min(0.01, `${label} must be at least 1%.`).max(10, `${label} must be 1000% or less.`);
export const thresholdsSchema = z.object({
  spendChangePct: pct('Spend change'),
  cpaIncreasePct: pct('CPA increase'),
  minConversions: z.number().int('Minimum conversions must be a whole number.').min(1, 'Minimum conversions must be at least 1.').max(100_000),
  minSpendCents: z.number().int().min(0, 'Minimum spend cannot be negative.').max(1e12),
  pacingTolerancePct: pct('Pacing tolerance'),
});

const createSchema = z.object({ name, currency, timezone });
const updateSchema = z.object({
  name,
  timezone,
  currency: currency.optional(),
  conversionDefinition: z.string().trim().max(300, 'Conversion definition must be 300 characters or fewer.'),
  branding: brandingSchema,
  thresholds: thresholdsSchema,
});

export interface ClientSummary extends ClientRow {
  rowCount: number;
  firstDate: string | null;
  lastDate: string | null;
}

/** Load a client inside the actor's agency, or behave exactly as if it does not exist. */
export async function requireClient(db: Db | Tx, actor: Actor, clientId: string): Promise<ClientRow> {
  if (!isUuid(clientId)) throw new NotFoundError('Client not found.');
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.agencyId, actor.agencyId)))
    .limit(1);
  if (!row) throw new NotFoundError('Client not found.');
  return row;
}

export async function listClients(actor: Actor): Promise<ClientSummary[]> {
  assertCan(actor, 'workspace:view');
  const db = await getDb();
  const rows = await db.select().from(clients).where(eq(clients.agencyId, actor.agencyId)).orderBy(asc(clients.name));
  const stats = await db
    .select({
      clientId: campaignDays.clientId,
      rowCount: sql<number>`count(*)::int`,
      firstDate: sql<string | null>`min(${campaignDays.date})::text`,
      lastDate: sql<string | null>`max(${campaignDays.date})::text`,
    })
    .from(campaignDays)
    .where(eq(campaignDays.agencyId, actor.agencyId))
    .groupBy(campaignDays.clientId);
  const byId = new Map(stats.map((s) => [s.clientId, s]));
  return rows.map((c) => ({ ...c, rowCount: byId.get(c.id)?.rowCount ?? 0, firstDate: byId.get(c.id)?.firstDate ?? null, lastDate: byId.get(c.id)?.lastDate ?? null }));
}

export async function getClient(actor: Actor, clientId: string): Promise<ClientRow> {
  assertCan(actor, 'workspace:view');
  return requireClient(await getDb(), actor, clientId);
}

async function assertNameFree(db: Db, actor: Actor, clientName: string, exceptId?: string): Promise<void> {
  const [clash] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.agencyId, actor.agencyId), sql`lower(${clients.name}) = lower(${clientName})`))
    .limit(1);
  if (clash && clash.id !== exceptId) throw new ValidationError(`A client named "${clientName}" already exists.`);
}

export async function createClient(actor: Actor, input: unknown): Promise<ClientRow> {
  assertCan(actor, 'client:create');
  const data = parseInput(createSchema, input);
  const db = await getDb();
  await assertNameFree(db, actor, data.name);
  const branding: ClientBranding = { color: DEFAULT_BRAND_COLOR, preparedBy: actor.agencyName, footer: '' };
  const thresholds: Thresholds = { ...DEFAULT_THRESHOLDS };
  const [row] = await db
    .insert(clients)
    .values({ agencyId: actor.agencyId, name: data.name, currency: data.currency, timezone: data.timezone, branding, thresholds })
    .returning();
  return row!;
}

export async function updateClient(actor: Actor, clientId: string, input: unknown): Promise<ClientRow> {
  assertCan(actor, 'client:update');
  const data = parseInput(updateSchema, input);
  const db = await getDb();
  const existing = await requireClient(db, actor, clientId);
  await assertNameFree(db, actor, data.name, existing.id);

  let nextCurrency = existing.currency;
  if (data.currency && data.currency !== existing.currency) {
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(campaignDays).where(eq(campaignDays.clientId, existing.id));
    if (n > 0) {
      throw new ValidationError('Currency cannot be changed after data has been imported, because stored amounts would be relabelled. Create a new client for another currency.');
    }
    nextCurrency = data.currency;
  }
  const [row] = await db
    .update(clients)
    .set({ name: data.name, timezone: data.timezone, currency: nextCurrency, conversionDefinition: data.conversionDefinition, branding: data.branding, thresholds: data.thresholds })
    .where(and(eq(clients.id, existing.id), eq(clients.agencyId, actor.agencyId)))
    .returning();
  return row!;
}

/** Deletes the client and, by cascade, its data, imports, budgets, reports and share links. */
export async function deleteClient(actor: Actor, clientId: string, confirmName: string): Promise<void> {
  assertCan(actor, 'client:delete');
  const db = await getDb();
  const existing = await requireClient(db, actor, clientId);
  if (confirmName.trim() !== existing.name) throw new ValidationError('Type the client name exactly to confirm deletion.');
  await db.delete(clients).where(and(eq(clients.id, existing.id), eq(clients.agencyId, actor.agencyId)));
}
