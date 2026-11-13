import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { formatTimestamp } from '@/lib/format-time';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { resolveSharedReport } from '@/lib/services/reports';
import { ReportDocument } from '@/components/report/report-document';
import { IconDownload, IconLock, LogoMark } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';
// A share link is a capability URL: keep it out of search engines and link previews.
export const metadata: Metadata = { title: 'Shared report', robots: { index: false, follow: false }, referrer: 'no-referrer' };

function Unavailable({ title, children }: { title: string; children: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <LogoMark size={28} />
      <h1 className="display mt-4 text-[1.6rem]">{title}</h1>
      <p className="muted mt-2 text-[0.95rem]">{children}</p>
    </main>
  );
}

/**
 * Public, read-only view of one finalized report. This page has no session, no
 * navigation and no workspace queries: it receives the stored snapshot and
 * renders it. Unknown, expired and revoked links all show the same message.
 */
export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const limit = rateLimit(`share:${clientIp(await headers())}`, 60, 60_000);
  if (!limit.allowed) return <Unavailable title="Too many requests">Please wait a minute and reload this page.</Unavailable>;
  const { token } = await params;
  const shared = await resolveSharedReport(token);
  if (!shared) return <Unavailable title="This link is not available">It may have expired or been revoked. Ask the person who sent it for a new link.</Unavailable>;

  return (
    <div className="mx-auto w-full max-w-[60rem] px-4 py-6 sm:py-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="muted flex items-center gap-1.5 text-[0.84rem]">
          <IconLock size={13} />
          Read-only report shared by {shared.snapshot.agencyName}. Link expires {formatTimestamp(shared.expiresAt)}.
        </p>
        <a className="btn" href={`/share/${encodeURIComponent(token)}/pdf`}>
          <IconDownload size={14} />
          Download PDF
        </a>
      </header>
      <main>
        <ReportDocument title={shared.title} commentary={shared.commentary} sections={shared.sections} snapshot={shared.snapshot} status="final" finalizedAt={shared.finalizedAt} />
      </main>
      <p className="muted mt-4 flex items-center justify-center gap-1.5 text-[0.78rem] print:hidden">
        <LogoMark size={14} />
        Prepared with CampaignLens
      </p>
    </div>
  );
}
