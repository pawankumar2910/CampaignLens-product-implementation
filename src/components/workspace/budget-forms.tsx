'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { monthBounds } from '@/lib/analytics';
import { createBudgetAction, deleteBudgetAction } from '@/lib/actions/workspace';
import { Dialog } from '@/components/ui/dialog';
import { IconPlus } from '@/components/ui/icons';
import { Notice } from '@/components/ui/primitives';

export function AddBudgetButton({ clientId, currency, campaigns, defaultMonth }: { clientId: string; currency: string; campaigns: Array<{ key: string; channel: string; campaign: string }>; defaultMonth: string }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'client' | 'campaign'>('client');
  const [periodType, setPeriodType] = useState<'month' | 'custom'>('month');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const month = String(f.get('month') ?? '');
    const period = periodType === 'month' ? (/^\d{4}-\d{2}$/.test(month) ? monthBounds(`${month}-01`) : null) : { from: String(f.get('from') ?? ''), to: String(f.get('to') ?? '') };
    if (!period) {
      setError('Choose a month.');
      return;
    }
    const selected = campaigns.find((c) => c.key === String(f.get('campaign') ?? ''));
    const amount = Number(f.get('amount'));
    startTransition(async () => {
      setError(null);
      const result = await createBudgetAction(clientId, {
        scope,
        channel: scope === 'campaign' ? (selected?.channel ?? null) : null,
        campaign: scope === 'campaign' ? (selected?.campaign ?? null) : null,
        periodStart: period.from,
        periodEnd: period.to,
        amountCents: Number.isFinite(amount) ? Math.round(amount * 100) : 0,
      });
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => { setError(null); setOpen(true); }}>
        <IconPlus />
        Add budget
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a budget">
        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="label">Applies to</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[0.9rem]">
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" checked={scope === 'client'} onChange={() => setScope('client')} /> Whole client (all channels)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" checked={scope === 'campaign'} onChange={() => setScope('campaign')} disabled={!campaigns.length} /> One campaign
              </label>
            </div>
          </fieldset>
          {scope === 'campaign' ? (
            <div>
              <label className="label" htmlFor="budget-campaign">
                Campaign
              </label>
              <select className="select" id="budget-campaign" name="campaign" required>
                {campaigns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.channel} / {c.campaign}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <fieldset>
            <legend className="label">Budget period</legend>
            <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.9rem]">
              <label className="flex items-center gap-2">
                <input type="radio" name="periodType" checked={periodType === 'month'} onChange={() => setPeriodType('month')} /> Calendar month
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="periodType" checked={periodType === 'custom'} onChange={() => setPeriodType('custom')} /> Custom dates
              </label>
            </div>
            {periodType === 'month' ? (
              <>
                <label className="sr-only" htmlFor="budget-month">
                  Month
                </label>
                <input className="input num w-44" id="budget-month" name="month" type="month" defaultValue={defaultMonth} required />
              </>
            ) : (
              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="label" htmlFor="budget-from">
                    First day
                  </label>
                  <input className="input num w-40" id="budget-from" name="from" type="date" required />
                </div>
                <div>
                  <label className="label" htmlFor="budget-to">
                    Last day
                  </label>
                  <input className="input num w-40" id="budget-to" name="to" type="date" required />
                </div>
              </div>
            )}
            <p className="hint">Both the first and last day are included. Dates are calendar days in the client’s reporting timezone.</p>
          </fieldset>
          <div>
            <label className="label" htmlFor="budget-amount">
              Budget for the period ({currency})
            </label>
            <input className="input num w-44" id="budget-amount" name="amount" type="number" min="0.01" step="0.01" required inputMode="decimal" />
          </div>
          {error ? (
            <Notice tone="danger" live>
              {error}
            </Notice>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'Saving…' : 'Add budget'}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function DeleteBudgetButton({ clientId, budgetId, label }: { clientId: string; budgetId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="btn btn-sm btn-quiet text-danger" onClick={() => setOpen(true)}>
        Delete<span className="sr-only"> budget: {label}</span>
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this budget?"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Keep budget
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteBudgetAction(clientId, budgetId);
                  if (result.ok) setOpen(false);
                  else setError(result.error);
                })
              }
            >
              {pending ? 'Deleting…' : 'Delete budget'}
            </button>
          </>
        }
      >
        <p>
          <strong>{label}</strong> will be removed from pacing and from the investigation queue. Imported spend is not affected, and you can add the budget again later. Finalized reports keep the pacing they were saved with.
        </p>
        {error ? (
          <div className="mt-3">
            <Notice tone="danger" live>
              {error}
            </Notice>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
