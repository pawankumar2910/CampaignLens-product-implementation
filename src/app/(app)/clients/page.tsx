import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDate, formatInteger } from '@/lib/analytics';
import { can } from '@/lib/auth/permissions';
import { requireActor } from '@/lib/auth/session';
import { listClients } from '@/lib/services/clients';
import { NewClientButton } from '@/components/workspace/client-forms';
import { EmptyState, Notice, PageHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Clients' };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const actor = await requireActor();
  const clients = await listClients(actor);
  const canCreate = can(actor.role, 'client:create');
  const timezones = Intl.supportedValuesOf('timeZone');
  const { deleted } = await searchParams;

  return (
    <>
      <PageHeader
        title="Clients"
        description={`Each client is a workspace with its own currency, reporting timezone, data, budgets and reports. ${actor.agencyName}.`}
        actions={canCreate ? <NewClientButton timezones={timezones} /> : undefined}
      />
      {deleted ? (
        <div className="mb-4">
          <Notice tone="ok" live>
            The client and all of its data were deleted.
          </Notice>
        </div>
      ) : null}
      {clients.length === 0 ? (
        <EmptyState title="Add your first client" action={canCreate ? <NewClientButton timezones={timezones} primary /> : undefined}>
          {canCreate
            ? 'Create a client workspace, then import a campaign export. Currency and timezone are set per client so amounts are never mixed.'
            : 'There are no clients yet. Ask an agency owner or analyst to create one.'}
        </EmptyState>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <caption className="sr-only">Client workspaces</caption>
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Currency</th>
                <th scope="col">Reporting timezone</th>
                <th scope="col">Data coverage</th>
                <th scope="col" className="r">
                  Campaign-day rows
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="!bg-transparent !text-[0.92rem] !font-semibold !normal-case !tracking-normal !text-ink">
                    <Link href={`/c/${c.id}`} className="link">
                      {c.name}
                    </Link>
                  </th>
                  <td>{c.currency}</td>
                  <td>{c.timezone}</td>
                  <td>{c.firstDate && c.lastDate ? `${formatDate(c.firstDate)} to ${formatDate(c.lastDate)}` : <span className="muted">No data imported</span>}</td>
                  <td className="r">{formatInteger(c.rowCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
