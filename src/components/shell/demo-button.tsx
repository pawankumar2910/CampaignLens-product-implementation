'use client';

import { useState, useTransition } from 'react';
import { startDemo } from '@/lib/actions/account';

export function DemoButton() {
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
            const result = await startDemo();
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending ? 'Preparing your sandbox…' : 'Explore the demo'}
      </button>
      <p role="status" className="sr-only">
        {pending ? 'Creating a private demo sandbox with fictional data.' : ''}
      </p>
      {error ? (
        <p role="alert" className="field-error max-w-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
