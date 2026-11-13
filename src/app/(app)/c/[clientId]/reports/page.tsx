import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDateRange } from '@/lib/analytics';
import { can } from '@/lib/auth/permissions';
import { formatTimestamp } from '@/lib/format-time';
import { clientPage, orNotFound, type SearchParams } from '@/lib/page';
import { listReports } from '@/lib/services/reports';
import { NewReportForm } from '@/components/report/new-report-form';
import { IconLock } from '@/components/ui/icons';
import { EmptyState, Notice, PageHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: SearchParams }) {
  const { actor, data, range } = await clientPage(params, searchParams);
  const { client } = data;
  const base = `/c/${client.id}`;
  const reports = await orNotFound(() => listReports(actor, client.id));
  const canWrite = can(actor.role, 'report:write');
  const deleted = (await searchParams).deleted;

  return (
    <>
      <PageHeader title="Reports" description={`${client.name} · a report captures the figures for one period, so what the client reads stays fixed even as new data arrives.`} />
      <div className="space-y-5">
        {deleted ? (
          <Notice tone="ok" live>
            The report was deleted.
          </Notice>
        ) : null}
        {canWrite ? (
          <section className="panel" aria-labelledby="new-report">
            <div className="panel-head">
              <h2 id="new-report" className="panel-title">
                New report
              </h2>
            </div>
            <div className="panel-body">
              {data.bounds ? (
                <>
                  <NewReportForm clientId={client.id} from={range.from} to={range.to} />
                  <p className="hint">The draft starts with the period you were viewing. You can add commentary, choose sections and refresh its data before finalizing.</p>
                </>
              ) : (
                <p className="text-[0.9rem]">
                  Import campaign data before building a report.{' '}
                  <Link href={`${base}/imports/new`} className="link">
                    Import a CSV
                  </Link>
                </p>
              )}
            </div>
          </section>
        ) : null}

        {reports.length === 0 ? (
          <EmptyState title="No reports yet">{canWrite ? 'Create a draft above. Nothing is shared until you finalize a report and create a link.' : 'No reports have been created for this client.'}</EmptyState>
        ) : (
          <div className="panel table-wrap">
            <table className="table">
              <caption className="sr-only">Reports, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Report</th>
                  <th scope="col">Period</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="!bg-transparent !text-[0.9rem] !font-semibold !normal-case !tracking-normal !text-ink !whitespace-normal">
                      <Link href={`${base}/reports/${r.id}`} className="link [overflow-wrap:anywhere]">
                        {r.title}
                      </Link>
                    </th>
                    <td className="num whitespace-nowrap">{formatDateRange(r.periodStart, r.periodEnd)}</td>
                    <td>
                      {r.status === 'final' ? (
                        <span className="badge badge-ok">
                          <IconLock size={11} />
                          Final
                        </span>
                      ) : (
                        <span className="badge badge-warn">Draft</span>
                      )}
                    </td>
                    <td className="num whitespace-nowrap">{formatTimestamp(r.finalizedAt ?? r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
