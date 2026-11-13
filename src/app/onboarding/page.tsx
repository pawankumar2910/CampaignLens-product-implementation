import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/session';
import { OnboardingForm } from '@/components/shell/onboarding-form';
import { SignOutButton } from '@/components/shell/nav';
import { LogoMark } from '@/components/ui/icons';

export const metadata: Metadata = { title: 'Set up your agency' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const resolved = await getActor();
  if (!resolved) redirect('/sign-in');
  if (resolved.actor) redirect('/clients');
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <p className="mb-7 flex items-center gap-2 text-[1.05rem] font-semibold tracking-tight">
        <LogoMark />
        CampaignLens
      </p>
      <main className="panel w-full max-w-md px-6 py-6">
        <p className="eyebrow">Step 1 of 2</p>
        <h1 className="display mt-1 text-[1.5rem]">Name your agency</h1>
        <p className="muted mb-4 mt-1 text-[0.9rem]">
          Signed in as {resolved.user.email}. Your agency holds your clients, their data and reports. You will be its owner and can invite colleagues later.
        </p>
        <OnboardingForm />
        <div className="mt-4 border-t border-line pt-3 text-[0.85rem]">
          <span className="muted">Expecting an invitation instead? Open the invite link you were sent. </span>
          <SignOutButton />
        </div>
      </main>
    </div>
  );
}
