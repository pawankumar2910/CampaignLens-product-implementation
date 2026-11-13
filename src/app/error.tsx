'use client';

import { useEffect } from 'react';

/** Unexpected failures land here. The message is generic on purpose: details go to the server log. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-5 text-center" role="alert">
      <h1 className="display text-[1.6rem]">Something went wrong</h1>
      <p className="muted mt-2 text-[0.95rem]">The page could not be loaded. Your data has not been changed. Try again, and if it keeps happening, reload the page.</p>
      {error.digest ? <p className="muted num mt-2 text-[0.78rem]">Reference: {error.digest}</p> : null}
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <a href="/clients" className="btn">
          Go to clients
        </a>
      </div>
    </main>
  );
}
