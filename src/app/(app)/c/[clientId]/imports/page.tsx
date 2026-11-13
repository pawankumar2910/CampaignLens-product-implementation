import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDateRange, formatInteger } from '@/lib/analytics';
import { can } from '@/lib/auth/permissions';
import { requireActor } from '@/lib/auth/session';
import { formatTimestamp } from '@/lib/format-time';
import { orNotFound } from '@/lib/page';
import { getClient } from '@/lib/services/clients';
import { listImports } from '@/lib/services/imports';
import { EmptyState, PageHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Imports' };

export default async function ImportsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const actor = await requireActor();
  const { clientId } = await params;
  const [client, records] = await orNotFound(() => Promise.all([getClient(actor, clientId), listImports(actor, clientId)]));
  const base = `/c/${client.id}`;
  const canImport = can(actor.role, 'data:import');
  const action = canImport ? (
    <Link href={`${base}/imports/new`} className="btn btn-primary">
      Import a CSV
    </Link>
  ) : undefined;

  return (
    <>
      <PageHeader title="Imports" description={`${client.name} · every file that contributed data, who imported it and what it covered. Amounts are in ${client.currency}; dates are calendar days in ${client.timezone}.`} actions={action} />
      {records.length === 0 ? (
        <EmptyState title="No imports yet" action={action}>
          {canImport ? 'Import a campaign export. You will map its columns, preview the normalized rows and review any problems before anything is saved.' : 'Nothing has been imported for this client yet.'}
        </EmptyState>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <caption className="sr-only">Import history, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Imported</th>
                <th scope="col">File and source</th>
                <th scope="col">Reporting coverage</th>
                <th scope="col" className="r">
                  Rows in file
                </th>
                <th scope="col" className="r">
                  Added
                </th>
                <th scope="col" className="r">
                  Replaced
                </th>
                <th scope="col" className="r">
                  Unchanged
                </th>
                <th scope="col" className="r">
                  Rejected
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">
                    <span className="num">{formatTimestamp(r.createdAt)}</span>
                    <span className="muted block text-[0.78rem]">by {r.createdByName}</span>
                  </td>
                  <td className="max-w-[20rem]">
                    <Link href={`${base}/imports/${r.id}`} className="link font-semibold [overflow-wrap:anywhere]">
                      {r.fileName}
                    </Link>
                    <span className="muted block text-[0.78rem] [overflow-wrap:anywhere]">{r.source}</span>
                  </td>
                  <td className="num whitespace-nowrap">{r.coverageStart && r.coverageEnd ? formatDateRange(r.coverageStart, r.coverageEnd) : <span className="muted">No valid rows</span>}</td>
                  <td className="r">{formatInteger(r.rowsInFile)}</td>
                  <td className="r">{formatInteger(r.inserted)}</td>
                  <td className="r">{formatInteger(r.replaced)}</td>
                  <td className="r">{formatInteger(r.unchanged + r.keptExisting)}</td>
                  <td className="r">{r.rejected ? <span className="badge badge-warn">{formatInteger(r.rejected)}</span> : '0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
