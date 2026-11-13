'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId } from 'react';
import { switchAgencyAction } from '@/lib/actions/account';
import { authClient } from '@/lib/auth/client';

export interface NavClient {
  id: string;
  name: string;
}

const CLIENT_NAV = [
  { slug: '', label: 'Overview' },
  { slug: '/campaigns', label: 'Campaigns' },
  { slug: '/pacing', label: 'Budget pacing' },
  { slug: '/investigate', label: 'Investigate' },
  { slug: '/imports', label: 'Imports' },
  { slug: '/reports', label: 'Reports' },
  { slug: '/settings', label: 'Client settings' },
] as const;

/** Carry the selected date range between a client's pages so context is never lost. */
function useRangeQuery(): string {
  const params = useSearchParams();
  const from = params.get('from');
  const to = params.get('to');
  return from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : '';
}

export function ClientSwitcher({ clients }: { clients: NavClient[] }) {
  const router = useRouter();
  const { clientId } = useParams<{ clientId?: string }>();
  // The switcher is rendered in both the sidebar and the mobile header, so ids must be unique.
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1 block">
        Client
      </label>
      <select
        id={id}
        className="select"
        value={clientId ?? ''}
        onChange={(e) => router.push(e.target.value ? `/c/${e.target.value}` : '/clients')}
      >
        <option value="">{clients.length ? 'All clients' : 'No clients yet'}</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ClientNav({ orientation, queueCount }: { orientation: 'vertical' | 'horizontal'; queueCount?: number }) {
  const { clientId } = useParams<{ clientId?: string }>();
  const pathname = usePathname();
  const query = useRangeQuery();
  if (!clientId) return null;
  const base = `/c/${clientId}`;
  const horizontal = orientation === 'horizontal';
  return (
    <nav aria-label="Client workspace" className={horizontal ? '-mx-4 overflow-x-auto px-4' : ''}>
      <ul className={horizontal ? 'flex gap-1 whitespace-nowrap' : 'space-y-0.5'}>
        {CLIENT_NAV.map((item) => {
          const href = `${base}${item.slug}`;
          const active = item.slug === '' ? pathname === base : pathname.startsWith(href);
          return (
            <li key={item.slug}>
              <Link
                href={`${href}${query}`}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-[0.9rem] no-underline ${
                  active ? 'bg-brand-soft font-semibold text-brand-strong' : 'text-ink-2 hover:bg-sunken'
                } ${horizontal ? (active ? 'shadow-[inset_0_-2px_0_var(--color-brand)]' : '') : ''}`}
              >
                {item.label}
                {item.slug === '/investigate' && queueCount ? <span className="badge num">{queueCount}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AgencyNav({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  const pathname = usePathname();
  const items = [
    { href: '/clients', label: 'All clients' },
    { href: '/team', label: 'Team' },
  ];
  return (
    <nav aria-label="Agency">
      <ul className={orientation === 'horizontal' ? 'flex gap-1' : 'space-y-0.5'}>
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-[6px] px-2.5 py-1.5 text-[0.9rem] no-underline ${active ? 'bg-brand-soft font-semibold text-brand-strong' : 'text-ink-2 hover:bg-sunken'}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SignOutButton({ label = 'Sign out' }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-quiet btn-sm"
      onClick={async () => {
        await authClient.signOut();
        router.push('/');
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}

/** Shown only to people who belong to more than one agency. */
export function AgencySwitcher({ agencies, current }: { agencies: Array<{ id: string; name: string }>; current: string }) {
  const id = useId();
  if (agencies.length < 2) return null;
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1 block">
        Agency
      </label>
      <select id={id} className="select" value={current} onChange={(e) => void switchAgencyAction(e.target.value)}>
        {agencies.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
