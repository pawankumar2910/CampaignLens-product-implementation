'use client';

import { useState, useTransition } from 'react';
import { acceptInvitationAction, createAgencyAction } from '@/lib/actions/account';

export function OnboardingForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get('name') ?? '');
        startTransition(async () => {
          setError(null);
          const result = await createAgencyAction(name);
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <div>
        <label className="label" htmlFor="agency-name">
          Agency name
        </label>
        <input className="input" id="agency-name" name="name" required maxLength={80} aria-invalid={error ? true : undefined} />
        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Creating…' : 'Create agency'}
      </button>
    </form>
  );
}

export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await acceptInvitationAction(token);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending ? 'Joining…' : 'Accept invitation'}
      </button>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
