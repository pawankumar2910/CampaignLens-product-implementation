import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/auth';
import { getSessionUser } from '@/lib/auth/session';
import { AuthForm } from '@/components/shell/auth-form';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect('/clients');
  return (
    <>
      <h1 className="display mb-4 text-[1.5rem]">Sign in</h1>
      <AuthForm mode="sign-in" next={next} minPasswordLength={MIN_PASSWORD_LENGTH} />
    </>
  );
}
