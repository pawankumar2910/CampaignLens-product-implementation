import { NotFoundError } from '@/lib/auth/permissions';
import { getActor } from '@/lib/auth/session';
import { pdfResponse, renderReportPdf, reportPdfFileName } from '@/lib/reports/pdf';
import { getReport } from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

/** PDF of a report for a signed-in member of the report's agency. */
export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string; reportId: string }> }) {
  const resolved = await getActor();
  if (!resolved?.actor) return new Response('Sign in to download this report.', { status: 401 });
  const { clientId, reportId } = await params;
  try {
    const report = await getReport(resolved.actor, clientId, reportId);
    const buffer = await renderReportPdf({
      title: report.title,
      commentary: report.commentary,
      sections: report.sections,
      snapshot: report.snapshot,
      status: report.status,
      finalizedAt: report.finalizedAt?.toISOString() ?? null,
    });
    return pdfResponse(buffer, reportPdfFileName(report.snapshot));
  } catch (e) {
    // A report in another agency is indistinguishable from one that does not exist.
    if (e instanceof NotFoundError) return new Response('Report not found.', { status: 404 });
    throw e;
  }
}
