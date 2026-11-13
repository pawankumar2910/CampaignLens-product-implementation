import { clientIp, rateLimit } from '@/lib/rate-limit';
import { pdfResponse, renderReportPdf, reportPdfFileName } from '@/lib/reports/pdf';
import { resolveSharedReport } from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

/** PDF of a shared report. The token is the only credential, exactly as on the share page. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limit = rateLimit(`share-pdf:${clientIp(request.headers)}`, 20, 60_000);
  if (!limit.allowed) return new Response('Too many requests. Try again shortly.', { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  const { token } = await params;
  const shared = await resolveSharedReport(token);
  if (!shared) return new Response('This link is not valid. It may have expired or been revoked.', { status: 404 });
  const buffer = await renderReportPdf({ title: shared.title, commentary: shared.commentary, sections: shared.sections, snapshot: shared.snapshot, status: 'final', finalizedAt: shared.finalizedAt });
  return pdfResponse(buffer, reportPdfFileName(shared.snapshot));
}
