import type { Metadata } from 'next';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/auth';
import { AuthForm } from '@/components/shell/auth-form';

export const metadata: Metadata = { title: 'Create account' };
export const dynamic = 'force-dynamic';

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="display mb-1 text-[1.5rem]">Create your account</h1>
      <p className="muted mb-4 text-[0.9rem]">Next you will name your agency and add your first client.</p>
      <AuthForm mode="sign-up" next={next} minPasswordLength={MIN_PASSWORD_LENGTH} />
    </>
  );
}
