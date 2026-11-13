import type { Metadata } from 'next';
import Link from 'next/link';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/auth/permissions';
import { getSessionUser } from '@/lib/auth/session';
import { previewInvitation } from '@/lib/services/members';
import { AcceptInviteButton } from '@/components/shell/onboarding-form';
import { SignOutButton } from '@/components/shell/nav';
import { LogoMark } from '@/components/ui/icons';
import { Notice } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Invitation', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitation, user] = await Promise.all([previewInvitation(token), getSessionUser()]);
  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <p className="mb-7 flex items-center gap-2 text-[1.05rem] font-semibold tracking-tight">
        <LogoMark />
        CampaignLens
      </p>
      <main className="panel w-full max-w-md space-y-4 px-6 py-6">
        {!invitation ? (
          <>
            <h1 className="display text-[1.5rem]">This invitation is not valid</h1>
            <p className="muted text-[0.92rem]">It may have expired, been revoked, or already been used. Ask the agency owner for a new link.</p>
            <Link href="/" className="btn">
              Go to CampaignLens
            </Link>
          </>
        ) : (
          <>
            <h1 className="display text-[1.5rem]">Join {invitation.agencyName}</h1>
            <p className="text-[0.92rem]">
              You have been invited as <strong>{ROLE_LABEL[invitation.role]}</strong>. {ROLE_DESCRIPTION[invitation.role]}
            </p>
            <p className="muted text-[0.88rem]">This invitation is for {invitation.email}.</p>
            {user ? (
              user.email.toLowerCase() === invitation.email.toLowerCase() ? (
                <AcceptInviteButton token={token} />
              ) : (
                <>
                  <Notice tone="warn">You are signed in as {user.email}. Sign out and sign in with {invitation.email} to accept.</Notice>
                  <SignOutButton />
                </>
              )
            ) : (
              <div className="flex flex-wrap gap-2">
                <Link href={`/sign-up?next=${next}`} className="btn btn-primary">
                  Create an account
                </Link>
                <Link href={`/sign-in?next=${next}`} className="btn">
                  Sign in
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
