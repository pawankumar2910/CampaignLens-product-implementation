import type { Metadata } from 'next';
import Link from 'next/link';
import { can } from '@/lib/auth/permissions';
import { requireActor } from '@/lib/auth/session';
import { orNotFound } from '@/lib/page';
import { getClient } from '@/lib/services/clients';
import { EmptyState, Notice, PageHeader } from '@/components/ui/primitives';
import { ImportWizard } from '@/components/workspace/import-wizard';

export const metadata: Metadata = { title: 'Import data' };

export default async function NewImportPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const actor = await requireActor();
  const { clientId } = await params;
  const client = await orNotFound(() => getClient(actor, clientId));
  const { welcome } = await searchParams;

  return (
    <>
      <nav aria-label="Breadcrumb" className="muted mb-2 text-[0.84rem]">
        <Link href={`/c/${client.id}/imports`} className="link">
          Imports
        </Link>{' '}
        / New
      </nav>
      <PageHeader title="Import campaign data" description={`${client.name} · ${client.currency} · ${client.timezone}`} />
      {welcome ? (
        <div className="mb-4">
          <Notice tone="ok" title={`${client.name} is ready`} live>
            Step 2 of 2: import your first campaign export to see performance, pacing and items to investigate.
          </Notice>
        </div>
      ) : null}
      {can(actor.role, 'data:import') ? (
        <ImportWizard clientId={client.id} clientName={client.name} currency={client.currency} timezone={client.timezone} />
      ) : (
        <EmptyState
          title="Your role cannot import data"
          action={
            <Link href={`/c/${client.id}`} className="btn">
              Back to overview
            </Link>
          }
        >
          Viewers have read-only access. Ask an agency owner to make you an analyst.
        </EmptyState>
      )}
    </>
  );
}
