'use client';

import { useState, useTransition, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/actions/result';
import { Dialog } from './dialog';
import { Notice } from './primitives';

/**
 * A button that asks before it acts. Used for anything consequential: the dialog
 * says exactly what will happen and what cannot be undone, and Cancel is the
 * first button so it is the easy path.
 */
export function ConfirmButton({
  label,
  title,
  children,
  confirmLabel,
  action,
  danger,
  className,
  disabled,
}: {
  label: ReactNode;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  action: () => Promise<ActionResult<unknown> | void>;
  danger?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={className ?? 'btn'} disabled={disabled} onClick={() => { setError(null); setOpen(true); }}>
        {label}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await action();
                  if (result && !result.ok) setError(result.error);
                  else setOpen(false);
                })
              }
            >
              {pending ? 'Working…' : confirmLabel}
            </button>
          </>
        }
      >
        <div className="space-y-2">{children}</div>
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
