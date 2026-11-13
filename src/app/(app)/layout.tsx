import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { ROLE_LABEL } from '@/lib/auth/permissions';
import { requireActor } from '@/lib/auth/session';
import { listClients } from '@/lib/services/clients';
import { listMembershipsForUser } from '@/lib/services/members';
import { AgencyNav, AgencySwitcher, ClientNav, ClientSwitcher, SignOutButton } from '@/components/shell/nav';
import { LogoMark } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const clients = (await listClients(actor)).map((c) => ({ id: c.id, name: c.name }));

  const agencies = (await listMembershipsForUser(actor.userId)).map((m) => ({ id: m.agencyId, name: m.agencyName }));

  const brand = (
    <Link href="/clients" className="flex items-center gap-2 text-[1.02rem] font-semibold tracking-tight no-underline">
      <LogoMark />
      CampaignLens
    </Link>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-3.5 py-4 lg:flex print:!hidden">
        <div className="px-1.5">{brand}</div>
        <div className="px-1.5">
          <Suspense>
            <ClientSwitcher clients={clients} />
          </Suspense>
        </div>
        <Suspense>
          <ClientNav orientation="vertical" />
        </Suspense>
        <div>
          <p className="eyebrow mb-1 px-2.5">Agency</p>
          <AgencyNav orientation="vertical" />
        </div>
        <div className="px-1.5">
          <AgencySwitcher agencies={agencies} current={actor.agencyId} />
        </div>
        <div className="mt-auto border-t border-line px-1.5 pt-3 text-[0.82rem]">
          <p className="truncate font-semibold" title={actor.agencyName}>
            {actor.agencyName}
          </p>
          <p className="muted truncate" title={actor.email}>
            {actor.isDemo ? 'Demo visitor' : actor.userName} · {ROLE_LABEL[actor.role]}
          </p>
          <div className="-ml-2 mt-1.5">
            <SignOutButton label={actor.isDemo ? 'Leave demo' : 'Sign out'} />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile header */}
        <header className="border-b border-line bg-surface px-4 pb-2 pt-3 lg:hidden print:hidden">
          <div className="flex items-center justify-between gap-3">
            {brand}
            <SignOutButton label={actor.isDemo ? 'Leave demo' : 'Sign out'} />
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <Suspense>
              <ClientSwitcher clients={clients} />
            </Suspense>
            <AgencyNav orientation="horizontal" />
          </div>
          {agencies.length > 1 ? (
            <div className="mt-3">
              <AgencySwitcher agencies={agencies} current={actor.agencyId} />
            </div>
          ) : null}
          <div className="mt-2">
            <Suspense>
              <ClientNav orientation="horizontal" />
            </Suspense>
          </div>
        </header>

        {actor.isDemo ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-brand-line bg-brand-soft px-4 py-2 text-[0.84rem] text-brand-strong lg:px-8 print:hidden">
            <span className="badge badge-brand">Demo sandbox</span>
            <span>Every company, campaign and number here is fictional. This sandbox is private to you and is deleted after 24 hours.</span>
            <Link href="/sign-up" className="link ml-auto font-semibold">
              Create a real workspace
            </Link>
          </div>
        ) : null}

        <main id="main" className="mx-auto w-full max-w-[84rem] px-4 py-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
