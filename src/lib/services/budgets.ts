import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { daysInclusive, isValidDate } from '../analytics';
import { assertCan, NotFoundError, ValidationError, type Actor } from '../auth/permissions';
import { getDb } from '../db/client';
import { budgets, type BudgetRow } from '../db/schema';
import { isUuid, parseInput, requireClient } from './clients';

const isoDate = (label: string) => z.string().refine(isValidDate, `${label} must be a valid date.`);

const budgetSchema = z
  .object({
    scope: z.enum(['client', 'campaign']),
    channel: z.string().trim().max(120).nullable(),
    campaign: z.string().trim().max(200).nullable(),
    periodStart: isoDate('Start date'),
    periodEnd: isoDate('End date'),
    amountCents: z.number({ error: 'Enter a budget amount.' }).int().positive('Budget must be greater than zero.').max(1e13, 'Budget is too large.'),
  })
  .refine((b) => b.periodStart <= b.periodEnd, 'The end date must be on or after the start date.')
  .refine((b) => daysInclusive(b.periodStart, b.periodEnd) <= 366, 'A budget period can be at most 366 days.')
  .refine((b) => b.scope === 'client' || (!!b.channel && !!b.campaign), 'Choose the campaign this budget applies to.');

export async function createBudget(actor: Actor, clientId: string, input: unknown): Promise<BudgetRow> {
  assertCan(actor, 'budget:write');
  const data = parseInput(budgetSchema, input);
  const db = await getDb();
  const client = await requireClient(db, actor, clientId);
  const channel = data.scope === 'campaign' ? data.channel : null;
  const campaign = data.scope === 'campaign' ? data.campaign : null;

  // Two budgets for the same scope must not overlap: pacing would otherwise be ambiguous.
  const existing = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.clientId, client.id), eq(budgets.agencyId, actor.agencyId), eq(budgets.scope, data.scope)));
  const clash = existing.find((b) => b.channel === channel && b.campaign === campaign && b.periodStart <= data.periodEnd && b.periodEnd >= data.periodStart);
  if (clash) {
    throw new ValidationError(`This overlaps an existing budget for the same scope (${clash.periodStart} to ${clash.periodEnd}). Delete that budget first or choose different dates.`);
  }
  const [row] = await db
    .insert(budgets)
    .values({ agencyId: actor.agencyId, clientId: client.id, scope: data.scope, channel, campaign, periodStart: data.periodStart, periodEnd: data.periodEnd, amountCents: data.amountCents })
    .returning();
  return { ...row!, amountCents: Number(row!.amountCents) };
}

export async function deleteBudget(actor: Actor, clientId: string, budgetId: string): Promise<void> {
  assertCan(actor, 'budget:write');
  if (!isUuid(budgetId)) throw new NotFoundError('Budget not found.');
  const db = await getDb();
  const client = await requireClient(db, actor, clientId);
  const deleted = await db
    .delete(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.clientId, client.id), eq(budgets.agencyId, actor.agencyId)))
    .returning({ id: budgets.id });
  if (!deleted.length) throw new NotFoundError('Budget not found.');
}
