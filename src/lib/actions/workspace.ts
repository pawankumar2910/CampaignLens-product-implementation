'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActor } from '../auth/session';
import { createBudget, deleteBudget } from '../services/budgets';
import { createClient, deleteClient, updateClient } from '../services/clients';
import { commitImport, previewImport, type PreviewResult } from '../services/imports';
import {
  createReport, createShareLink, deleteReport, duplicateReport, finalizeReport, refreshReportSnapshot, revokeShareLink, updateReport,
} from '../services/reports';
import { run, type ActionResult } from './result';

/*
 * Server actions are public HTTP endpoints. Each one resolves the actor from the
 * session and delegates to a service, which checks the role and the agency scope.
 * No action trusts an id, role or agency supplied by the browser.
 */
const done = <T>(result: ActionResult<T>): ActionResult => (result.ok ? { ok: true, data: undefined } : result);

export async function createClientAction(input: { name: string; currency: string; timezone: string }): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => createClient(actor, input));
  if (!result.ok) return result;
  revalidatePath('/', 'layout');
  redirect(`/c/${result.data.id}/imports/new?welcome=1`);
}

export async function updateClientAction(clientId: string, input: unknown): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => updateClient(actor, clientId, input));
  revalidatePath('/', 'layout');
  return done(result);
}

export async function deleteClientAction(clientId: string, confirmName: string): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => deleteClient(actor, clientId, confirmName));
  if (!result.ok) return result;
  revalidatePath('/', 'layout');
  redirect('/clients?deleted=1');
}

export async function previewImportAction(clientId: string, input: unknown): Promise<ActionResult<PreviewResult>> {
  const actor = await requireActor();
  return run(() => previewImport(actor, clientId, input));
}

export async function commitImportAction(clientId: string, input: unknown): Promise<ActionResult<{ importId: string }>> {
  const actor = await requireActor();
  const result = await run(() => commitImport(actor, clientId, input));
  if (!result.ok) return result;
  revalidatePath('/', 'layout');
  return { ok: true, data: { importId: result.data.id } };
}

export async function createBudgetAction(clientId: string, input: unknown): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => createBudget(actor, clientId, input));
  revalidatePath(`/c/${clientId}`, 'layout');
  return done(result);
}

export async function deleteBudgetAction(clientId: string, budgetId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => deleteBudget(actor, clientId, budgetId));
  revalidatePath(`/c/${clientId}`, 'layout');
  return done(result);
}

export async function createReportAction(clientId: string, input: { from: string; to: string }): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => createReport(actor, clientId, input));
  if (!result.ok) return result;
  revalidatePath(`/c/${clientId}`, 'layout');
  redirect(`/c/${clientId}/reports/${result.data.id}`);
}

export async function updateReportAction(clientId: string, reportId: string, input: unknown): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => updateReport(actor, clientId, reportId, input));
  revalidatePath(`/c/${clientId}`, 'layout');
  return done(result);
}

export async function refreshReportAction(clientId: string, reportId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => refreshReportSnapshot(actor, clientId, reportId));
  revalidatePath(`/c/${clientId}`, 'layout');
  return done(result);
}

export async function finalizeReportAction(clientId: string, reportId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => finalizeReport(actor, clientId, reportId));
  revalidatePath(`/c/${clientId}`, 'layout');
  return done(result);
}

export async function duplicateReportAction(clientId: string, reportId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => duplicateReport(actor, clientId, reportId));
  if (!result.ok) return result;
  revalidatePath(`/c/${clientId}`, 'layout');
  redirect(`/c/${clientId}/reports/${result.data.id}`);
}

export async function deleteReportAction(clientId: string, reportId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => deleteReport(actor, clientId, reportId));
  if (!result.ok) return result;
  revalidatePath(`/c/${clientId}`, 'layout');
  redirect(`/c/${clientId}/reports?deleted=1`);
}

export async function createShareLinkAction(clientId: string, reportId: string, expiresInDays: number): Promise<ActionResult<{ token: string; expiresAt: string }>> {
  const actor = await requireActor();
  const result = await run(() => createShareLink(actor, clientId, reportId, { expiresInDays }));
  if (!result.ok) return result;
  revalidatePath(`/c/${clientId}`, 'layout');
  return { ok: true, data: { token: result.data.token, expiresAt: result.data.link.expiresAt.toISOString() } };
}

export async function revokeShareLinkAction(clientId: string, reportId: string, linkId: string): Promise<ActionResult> {
  const actor = await requireActor();
  const result = await run(() => revokeShareLink(actor, clientId, reportId, linkId));
  revalidatePath(`/c/${clientId}`, 'layout');
  return done(result);
}
