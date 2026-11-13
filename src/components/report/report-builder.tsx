'use client';

import { useState, useTransition } from 'react';
import {
  createShareLinkAction, deleteReportAction, duplicateReportAction, finalizeReportAction, refreshReportAction, revokeShareLinkAction, updateReportAction,
} from '@/lib/actions/workspace';
import { formatTimestamp } from '@/lib/format-time';
import { REPORT_SECTIONS, type ReportSnapshot } from '@/lib/reports/snapshot';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { IconDownload, IconLink, IconLock } from '@/components/ui/icons';
import { Notice } from '@/components/ui/primitives';
import { ReportDocument } from './report-document';

export interface BuilderReport {
  id: string;
  clientId: string;
  title: string;
  commentary: string;
  sections: string[];
  status: 'draft' | 'final';
  finalizedAt: string | null;
  snapshot: ReportSnapshot;
}

export interface BuilderLink {
  id: string;
  createdAt: string;
  createdByName: string;
  expiresAt: string;
  state: 'active' | 'expired' | 'revoked';
}

const LINK_STATE: Record<BuilderLink['state'], { label: string; badge: string }> = {
  active: { label: 'Active', badge: 'badge-ok' },
  expired: { label: 'Expired', badge: '' },
  revoked: { label: 'Revoked', badge: 'badge-danger' },
};

export function ReportBuilder({ report, links, canEdit }: { report: BuilderReport; links: BuilderLink[]; canEdit: boolean }) {
  const [title, setTitle] = useState(report.title);
  const [commentary, setCommentary] = useState(report.commentary);
  const [sections, setSections] = useState<string[]>(report.sections);
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [newLink, setNewLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isDraft = report.status === 'draft';
  const editable = isDraft && canEdit;
  const pdfHref = `/c/${report.clientId}/reports/${report.id}/pdf`;
  // Keep sections in document order regardless of the order they were ticked.
  const ordered = REPORT_SECTIONS.map((s) => s.id).filter((id) => sections.includes(id));
  // Compare in document order: ticking sections in a different order is not a change.
  const dirty = title !== report.title || commentary !== report.commentary || ordered.join('|') !== report.sections.join('|');
  const draftInput = { title, commentary, sections: ordered };

  const save = () =>
    startTransition(async () => {
      const result = await updateReportAction(report.clientId, report.id, draftInput);
      setMessage(result.ok ? { tone: 'ok', text: 'Draft saved.' } : { tone: 'danger', text: result.error });
    });

  const refresh = () =>
    startTransition(async () => {
      const result = await refreshReportAction(report.clientId, report.id);
      setMessage(result.ok ? { tone: 'ok', text: 'Data refreshed from the workspace.' } : { tone: 'danger', text: result.error });
    });

  async function finalize() {
    if (dirty) {
      const saved = await updateReportAction(report.clientId, report.id, draftInput);
      if (!saved.ok) return saved;
    }
    return finalizeReportAction(report.clientId, report.id);
  }

  const createLink = () =>
    startTransition(async () => {
      setCopied(false);
      const result = await createShareLinkAction(report.clientId, report.id, expiresInDays);
      if (!result.ok) return setMessage({ tone: 'danger', text: result.error });
      setMessage(null);
      setNewLink({ url: `${window.location.origin}/share/${result.data.token}`, expiresAt: result.data.expiresAt });
    });

  return (
    <div className="grid gap-5 xl:grid-cols-[23rem_minmax(0,1fr)]">
      <div className="space-y-4 self-start xl:sticky xl:top-4 print:hidden">
        <section className="panel" aria-labelledby="rb-status">
          <div className="panel-head">
            <h2 id="rb-status" className="panel-title">
              {isDraft ? 'Draft' : 'Finalized report'}
            </h2>
            <span className={`badge ${isDraft ? 'badge-warn' : 'badge-ok'}`}>
              {isDraft ? null : <IconLock size={11} />}
              {isDraft ? 'Draft' : 'Final'}
            </span>
          </div>
          <div className="space-y-3 px-4 py-3.5 text-[0.88rem]">
            <p className="muted">
              {isDraft
                ? `This report shows data captured ${formatTimestamp(report.snapshot.generatedAt)}. It does not change when new data is imported unless you refresh it. Finalizing locks the content and the data.`
                : `Finalized ${report.finalizedAt ? formatTimestamp(report.finalizedAt) : ''}. Content and data are locked. To change anything, duplicate it as a new draft.`}
            </p>
            <div className="flex flex-wrap gap-2">
              {dirty ? (
                <span className="btn" aria-disabled="true" title="Save the draft to include your edits in the PDF">
                  <IconDownload size={14} />
                  Download PDF
                </span>
              ) : (
                <a className="btn" href={pdfHref}>
                  <IconDownload size={14} />
                  Download PDF
                </a>
              )}
              {editable ? (
                <button type="button" className="btn" onClick={refresh} disabled={pending}>
                  Refresh data
                </button>
              ) : null}
              {canEdit ? (
                <button type="button" className="btn" disabled={pending} onClick={() => startTransition(async () => { const r = await duplicateReportAction(report.clientId, report.id); if (r && !r.ok) setMessage({ tone: 'danger', text: r.error }); })}>
                  Duplicate
                </button>
              ) : null}
            </div>
            {dirty ? <p className="hint !mt-0">Save the draft to include your edits in the PDF.</p> : null}
          </div>
        </section>

        {isDraft ? (
          <section className="panel" aria-labelledby="rb-edit">
            <div className="panel-head">
              <h2 id="rb-edit" className="panel-title">
                Content
              </h2>
            </div>
            <fieldset disabled={!editable || pending} className="space-y-4 px-4 py-3.5">
              <div>
                <label className="label" htmlFor="rb-title">
                  Title
                </label>
                <input className="input" id="rb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
              </div>
              <div>
                <label className="label" htmlFor="rb-commentary">
                  Your commentary
                </label>
                <textarea className="textarea" id="rb-commentary" value={commentary} onChange={(e) => setCommentary(e.target.value)} maxLength={5000} aria-describedby="rb-commentary-hint" />
                <p className="hint" id="rb-commentary-hint">
                  Shown under the summary as your own words. Leave a blank line between paragraphs. {commentary.length}/5,000.
                </p>
              </div>
              <fieldset>
                <legend className="label">Sections to include</legend>
                <ul className="space-y-1.5">
                  {REPORT_SECTIONS.map((s) => (
                    <li key={s.id}>
                      <label className="flex items-start gap-2.5 text-[0.88rem]">
                        <input type="checkbox" className="mt-1" checked={sections.includes(s.id)} onChange={(e) => setSections((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))} />
                        <span>
                          <span className="font-semibold">{s.label}</span>
                          <span className="muted block text-[0.8rem]">{s.description}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              {!canEdit ? <Notice>Your role is read-only, so this draft cannot be edited.</Notice> : null}
            </fieldset>
            {editable ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                <button type="button" className="btn btn-primary" onClick={save} disabled={pending || !dirty}>
                  {pending ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
                </button>
                <ConfirmButton label="Finalize…" title="Finalize this report?" confirmLabel="Finalize report" action={finalize} disabled={ordered.length === 0}>
                  <p>Finalizing locks the title, commentary, sections and the data in this report. It will not change when new data is imported.</p>
                  <p>You can then create share links. To make changes later, duplicate the report as a new draft.</p>
                </ConfirmButton>
              </div>
            ) : null}
          </section>
        ) : null}

        {!isDraft ? (
          <section className="panel" aria-labelledby="rb-share">
            <div className="panel-head">
              <h2 id="rb-share" className="panel-title">
                Share links
              </h2>
            </div>
            <div className="space-y-3 px-4 py-3.5 text-[0.88rem]">
              <p className="muted">A link opens a read-only copy of this report for anyone who has it. It shows nothing else from the workspace, expires on its own, and can be revoked at any time.</p>
              {canEdit ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="label" htmlFor="rb-expiry">
                      Link expires after
                    </label>
                    <select id="rb-expiry" className="select w-36" value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))}>
                      {[1, 7, 14, 30, 90].map((d) => (
                        <option key={d} value={d}>
                          {d} {d === 1 ? 'day' : 'days'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={createLink} disabled={pending}>
                    <IconLink size={14} />
                    Create share link
                  </button>
                </div>
              ) : null}
              {newLink ? (
                <div className="rounded-[6px] border border-brand-line bg-brand-soft p-3" role="status">
                  <label className="label !text-brand-strong" htmlFor="rb-new-link">
                    New link, shown only once
                  </label>
                  <div className="flex gap-2">
                    <input id="rb-new-link" className="input num text-[0.8rem]" readOnly value={newLink.url} onFocus={(e) => e.currentTarget.select()} />
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(newLink.url);
                          setCopied(true);
                        } catch {
                          setCopied(false);
                        }
                      }}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="hint">Copy it now. Only a fingerprint of the link is stored, so it cannot be shown again. Expires {formatTimestamp(newLink.expiresAt)}.</p>
                </div>
              ) : null}
            </div>
            {links.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 text-[0.84rem]">
                    <div className="min-w-0">
                      <p>
                        <span className={`badge ${LINK_STATE[l.state].badge}`}>{LINK_STATE[l.state].label}</span> <span className="num">created {formatTimestamp(l.createdAt)}</span>
                      </p>
                      <p className="muted num">
                        by {l.createdByName} · {l.state === 'expired' ? 'expired' : 'expires'} {formatTimestamp(l.expiresAt)}
                      </p>
                    </div>
                    {l.state === 'active' && canEdit ? (
                      <ConfirmButton label="Revoke" className="btn btn-sm" title="Revoke this share link?" confirmLabel="Revoke link" danger action={() => revokeShareLinkAction(report.clientId, report.id, l.id)}>
                        <p>Anyone using this link will immediately lose access to the report. This cannot be undone, but you can create a new link.</p>
                      </ConfirmButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted border-t border-line px-4 py-3 text-[0.84rem]">No share links have been created for this report.</p>
            )}
          </section>
        ) : null}

        {message ? (
          <Notice tone={message.tone} live>
            {message.text}
          </Notice>
        ) : null}

        {canEdit ? (
          <ConfirmButton label="Delete report…" className="btn btn-quiet text-danger" title="Delete this report?" confirmLabel="Delete report" danger action={() => deleteReportAction(report.clientId, report.id)}>
            <p>
              <strong>{report.title}</strong> will be permanently deleted{isDraft ? '.' : ', and every share link for it will stop working.'} Imported campaign data is not affected.
            </p>
          </ConfirmButton>
        ) : null}
      </div>

      <div className="min-w-0">
        <p className="eyebrow mb-2 print:hidden">{isDraft ? 'Preview (updates as you edit)' : 'Report as shared'}</p>
        <ReportDocument title={title || 'Untitled report'} commentary={commentary} sections={ordered} snapshot={report.snapshot} status={report.status} finalizedAt={report.finalizedAt} />
      </div>
    </div>
  );
}
