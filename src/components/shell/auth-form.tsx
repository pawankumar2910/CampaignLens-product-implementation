'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth/client';

/** Only same-site paths are followed after sign-in, so `next` cannot send anyone elsewhere. */
function safeNext(next: string | undefined, fallback: string): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : fallback;
}

export function AuthForm({ mode, next, minPasswordLength }: { mode: 'sign-in' | 'sign-up'; next?: string; minPasswordLength: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signUp = mode === 'sign-up';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '').trim();
    setError(null);
    if (signUp && password.length < minPasswordLength) {
      setError(`Use a password of at least ${minPasswordLength} characters.`);
      return;
    }
    setPending(true);
    const result = signUp ? await authClient.signUp.email({ name, email, password }) : await authClient.signIn.email({ email, password });
    if (result.error) {
      setPending(false);
      setError(
        result.error.status === 429
          ? 'Too many attempts. Wait a few seconds and try again.'
          : (result.error.message ?? (signUp ? 'Could not create the account.' : 'Email or password is incorrect.')),
      );
      return;
    }
    router.push(safeNext(next, signUp ? '/onboarding' : '/clients'));
    router.refresh();
  }

  const query = next ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
      {signUp ? (
        <div>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input className="input" id="name" name="name" autoComplete="name" required maxLength={80} />
        </div>
      ) : null}
      <div>
        <label className="label" htmlFor="email">
          Work email
        </label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required maxLength={200} />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete={signUp ? 'new-password' : 'current-password'}
          required
          minLength={signUp ? minPasswordLength : undefined}
          maxLength={128}
          aria-describedby={signUp ? 'password-hint' : undefined}
        />
        {signUp ? (
          <p className="hint" id="password-hint">
            At least {minPasswordLength} characters.
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? 'Please wait…' : signUp ? 'Create account' : 'Sign in'}
      </button>
      <p className="muted text-center text-[0.88rem]">
        {signUp ? (
          <>
            Already have an account?{' '}
            <Link className="link" href={`/sign-in${query}`}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{' '}
            <Link className="link" href={`/sign-up${query}`}>
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
