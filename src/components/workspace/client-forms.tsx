'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { CURRENCIES, type Thresholds } from '@/lib/analytics';
import { createClientAction, deleteClientAction, updateClientAction } from '@/lib/actions/workspace';
import type { ClientBranding } from '@/lib/db/schema';
import { Dialog } from '@/components/ui/dialog';
import { IconPlus } from '@/components/ui/icons';
import { Notice } from '@/components/ui/primitives';

export function NewClientButton({ timezones, primary }: { timezones: string[]; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Default to the browser's timezone; the user confirms it before creating the client.
  const [timezone, setTimezone] = useState('UTC');

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await createClientAction({ name: String(form.get('name') ?? ''), currency: String(form.get('currency') ?? ''), timezone: String(form.get('timezone') ?? '') });
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        className={`btn ${primary === false ? '' : 'btn-primary'}`}
        onClick={() => {
          const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (timezones.includes(local)) setTimezone(local);
          setError(null);
          setOpen(true);
        }}
      >
        <IconPlus />
        New client
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New client workspace">
        <form onSubmit={submit} className="space-y-4" id="new-client-form">
          <div>
            <label className="label" htmlFor="client-name">
              Client name
            </label>
            <input className="input" id="client-name" name="name" required maxLength={80} autoComplete="off" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="client-currency">
                Currency
              </label>
              <select className="select" id="client-currency" name="currency" defaultValue="USD" aria-describedby="currency-hint">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="client-timezone">
                Reporting timezone
              </label>
              <select className="select" id="client-timezone" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {timezones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="hint" id="currency-hint">
            All imports for this client must be in this currency; other currencies are rejected rather than converted. The timezone defines the calendar day used by your ad platform exports.
          </p>
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
              {pending ? 'Creating…' : 'Create client'}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export interface ClientSettingsValues {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  conversionDefinition: string;
  branding: ClientBranding;
  thresholds: Thresholds;
}

export function ClientSettingsForm({ client, timezones, canEdit, hasData }: { client: ClientSettingsValues; timezones: string[]; canEdit: boolean; hasData: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => Number(f.get(k));
    startTransition(async () => {
      setMessage(null);
      const result = await updateClientAction(client.id, {
        name: String(f.get('name') ?? ''),
        timezone: String(f.get('timezone') ?? ''),
        currency: hasData ? undefined : String(f.get('currency') ?? ''),
        conversionDefinition: String(f.get('conversionDefinition') ?? ''),
        branding: { color: String(f.get('color') ?? ''), preparedBy: String(f.get('preparedBy') ?? ''), footer: String(f.get('footer') ?? '') },
        thresholds: {
          spendChangePct: num('spendChangePct') / 100,
          cpaIncreasePct: num('cpaIncreasePct') / 100,
          minConversions: num('minConversions'),
          minSpendCents: Math.round(num('minSpend') * 100),
          pacingTolerancePct: num('pacingTolerancePct') / 100,
        },
      });
      setMessage(result.ok ? { tone: 'ok', text: 'Settings saved.' } : { tone: 'danger', text: result.error });
    });
  }

  const t = client.thresholds;
  const number = (name: string, label: string, value: number, hint: string, suffix: string, step = 1) => (
    <div>
      <label className="label" htmlFor={`set-${name}`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input className="input num w-28" id={`set-${name}`} name={name} type="number" min={0} step={step} defaultValue={value} required aria-describedby={`set-${name}-hint`} />
        <span className="muted text-[0.85rem]">{suffix}</span>
      </div>
      <p className="hint" id={`set-${name}-hint`}>
        {hint}
      </p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={!canEdit || pending} className="space-y-5">
        <section className="panel" aria-labelledby="set-general">
          <div className="panel-head">
            <h2 id="set-general" className="panel-title">
              Workspace
            </h2>
          </div>
          <div className="panel-body grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="set-name">
                Client name
              </label>
              <input className="input" id="set-name" name="name" defaultValue={client.name} required maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="set-timezone">
                Reporting timezone
              </label>
              <select className="select" id="set-timezone" name="timezone" defaultValue={client.timezone}>
                {timezones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
              <p className="hint">Defines the calendar day for imported dates and “today” for budget pacing.</p>
            </div>
            <div>
              <label className="label" htmlFor="set-currency">
                Currency
              </label>
              <select className="select" id="set-currency" name="currency" defaultValue={client.currency} disabled={hasData} aria-describedby="set-currency-hint">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <p className="hint" id="set-currency-hint">
                {hasData ? 'Locked because data has been imported. Stored amounts are never relabelled or converted.' : 'Can be changed until the first import.'}
              </p>
            </div>
            <div>
              <label className="label" htmlFor="set-conversion">
                What counts as a conversion
              </label>
              <input className="input" id="set-conversion" name="conversionDefinition" defaultValue={client.conversionDefinition} maxLength={300} placeholder="e.g. Purchases, 7-day click attribution" />
              <p className="hint">Shown on dashboards and reports so conversion numbers are read in context.</p>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="set-brand">
          <div className="panel-head">
            <h2 id="set-brand" className="panel-title">
              Report branding
            </h2>
          </div>
          <div className="panel-body grid gap-4 md:grid-cols-[auto_1fr_1fr]">
            <div>
              <label className="label" htmlFor="set-color">
                Accent colour
              </label>
              <input className="h-9 w-20 cursor-pointer rounded-[6px] border border-line-strong bg-white p-1" id="set-color" name="color" type="color" defaultValue={client.branding.color} />
            </div>
            <div>
              <label className="label" htmlFor="set-prepared">
                Prepared by
              </label>
              <input className="input" id="set-prepared" name="preparedBy" defaultValue={client.branding.preparedBy} maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="set-footer">
                Report footer
              </label>
              <input className="input" id="set-footer" name="footer" defaultValue={client.branding.footer} maxLength={200} placeholder="e.g. Confidential. Prepared for the client." />
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="set-thresholds">
          <div className="panel-head">
            <div>
              <h2 id="set-thresholds" className="panel-title">
                Investigation thresholds
              </h2>
              <p className="muted mt-0.5 text-[0.84rem]">Rules only fire above these levels, and never below the minimum volumes. They decide what gets flagged, not what is true.</p>
            </div>
          </div>
          <div className="panel-body grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {number('spendChangePct', 'Spend change', Math.round(t.spendChangePct * 100), 'Flag a campaign whose spend moved by at least this much against the previous period.', '%')}
            {number('cpaIncreasePct', 'CPA increase', Math.round(t.cpaIncreasePct * 100), 'Flag a campaign whose CPA rose by at least this much.', '%')}
            {number('pacingTolerancePct', 'Pacing tolerance', Math.round(t.pacingTolerancePct * 100), 'Flag a budget when the linear projection misses it by at least this much.', '%')}
            {number('minConversions', 'Minimum conversions', t.minConversions, 'CPA is only judged when each period has at least this many conversions. Below it, a campaign is marked low volume.', 'conversions')}
            {number('minSpend', 'Minimum spend', t.minSpendCents / 100, 'Campaigns that spent less than this in a period are not evaluated.', client.currency, 0.01)}
          </div>
        </section>
      </fieldset>

      {message ? (
        <Notice tone={message.tone} live>
          {message.text}
        </Notice>
      ) : null}
      {canEdit ? (
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </button>
      ) : (
        <Notice>Your role is read-only. Ask an agency owner or analyst to change these settings.</Notice>
      )}
    </form>
  );
}

export function DeleteClientSection({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="panel border-danger/40" aria-labelledby="set-danger">
      <div className="panel-head">
        <h2 id="set-danger" className="panel-title text-danger">
          Delete this client
        </h2>
      </div>
      <div className="panel-body flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[0.9rem]">Permanently deletes the client with all imported data, budgets and reports. Shared report links stop working. This cannot be undone.</p>
        <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
          Delete client…
        </button>
      </div>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setTyped('');
          setError(null);
        }}
        title={`Delete ${clientName}?`}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setError(null);
              const result = await deleteClientAction(clientId, typed);
              if (result && !result.ok) setError(result.error);
            });
          }}
        >
          <p>
            This deletes all campaign data, imports, budgets and reports for <strong>{clientName}</strong>, and breaks every shared report link. There is no undo.
          </p>
          <div>
            <label className="label" htmlFor="confirm-delete">
              Type the client name to confirm
            </label>
            <input className="input" id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
          {error ? (
            <Notice tone="danger" live>
              {error}
            </Notice>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Keep client
            </button>
            <button type="submit" className="btn btn-danger" disabled={pending || typed.trim() !== clientName}>
              {pending ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
