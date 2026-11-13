'use client';

import { useState, useTransition } from 'react';
import { createReportAction } from '@/lib/actions/workspace';
import { Notice } from '@/components/ui/primitives';

export function NewReportForm({ clientId, from, to }: { clientId: string; from: string; to: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          const result = await createReportAction(clientId, { from: String(f.get('from') ?? ''), to: String(f.get('to') ?? '') });
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <div>
        <label className="label" htmlFor="report-from">
          Report period from
        </label>
        <input className="input num w-[9.5rem]" id="report-from" name="from" type="date" defaultValue={from} required />
      </div>
      <div>
        <label className="label" htmlFor="report-to">
          To
        </label>
        <input className="input num w-[9.5rem]" id="report-to" name="to" type="date" defaultValue={to} required />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Capturing data…' : 'Create draft report'}
      </button>
      {error ? (
        <div className="basis-full">
          <Notice tone="danger" live>
            {error}
          </Notice>
        </div>
      ) : null}
    </form>
  );
}
