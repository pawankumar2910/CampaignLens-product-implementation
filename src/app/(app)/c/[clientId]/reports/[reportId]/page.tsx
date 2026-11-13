import type { Metadata } from 'next';
import Link from 'next/link';
import { can } from '@/lib/auth/permissions';
import { requireActor } from '@/lib/auth/session';
import { orNotFound } from '@/lib/page';
import { getReport, listShareLinks, shareLinkState } from '@/lib/services/reports';
import { ReportBuilder } from '@/components/report/report-builder';

export const metadata: Metadata = { title: 'Report' };

export default async function ReportPage({ params }: { params: Promise<{ clientId: string; reportId: string }> }) {
  const actor = await requireActor();
  const { clientId, reportId } = await params;
  const [report, links] = await orNotFound(() => Promise.all([getReport(actor, clientId, reportId), listShareLinks(actor, clientId, reportId)]));
  const now = new Date();

  return (
    <>
      <nav aria-label="Breadcrumb" className="muted mb-3 text-[0.84rem] print:hidden">
        <Link href={`/c/${clientId}/reports`} className="link">
          Reports
        </Link>{' '}
        / {report.status === 'final' ? 'Finalized report' : 'Draft'}
      </nav>
      <ReportBuilder
        // Remount only for a different report. Saving or refreshing must not reset the form or its status message.
        key={report.id}
        report={{
          id: report.id,
          clientId: report.clientId,
          title: report.title,
          commentary: report.commentary,
          sections: report.sections,
          status: report.status,
          finalizedAt: report.finalizedAt?.toISOString() ?? null,
          snapshot: report.snapshot,
        }}
        // Only display fields reach the browser: token hashes stay on the server.
        links={links.map((l) => ({ id: l.id, createdAt: l.createdAt.toISOString(), createdByName: l.createdByName, expiresAt: l.expiresAt.toISOString(), state: shareLinkState(l, now) }))}
        canEdit={can(actor.role, 'report:write')}
      />
    </>
  );
}
