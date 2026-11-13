'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { DATE_FORMATS, detectDateFormat, formatCount, formatDate, formatDateRange, formatInteger, formatMoney, type DateFormat } from '@/lib/analytics';
import { commitImportAction, previewImportAction } from '@/lib/actions/workspace';
import { CsvStructureError, MAX_DATA_ROWS, MAX_FILE_BYTES, parseCsv, type ParsedCsv } from '@/lib/import/csv';
import { CANONICAL_FIELDS, suggestMapping, validateMapping, type CanonicalField, type ImportMapping } from '@/lib/import/mapping';
import type { ImportIssue } from '@/lib/import/normalize';
import type { ImportPreview } from '@/lib/services/imports';
import { IconAlert, IconCheck, IconDownload, IconUpload } from '@/components/ui/icons';
import { Notice } from '@/components/ui/primitives';

type Step = 'file' | 'map' | 'preview' | 'confirm';
const STEPS: Array<{ id: Step | 'summary'; label: string }> = [
  { id: 'file', label: 'Choose file' },
  { id: 'map', label: 'Map columns' },
  { id: 'preview', label: 'Preview records' },
  { id: 'confirm', label: 'Review and confirm' },
  { id: 'summary', label: 'Summary' },
];
const FIXED = '__fixed__';

const SAMPLES = [
  { href: '/samples/fernhill-google-ads-pmax.csv', label: 'Google Ads export', note: 'valid, needs a channel name' },
  { href: '/samples/fernhill-brand-search-restated.csv', label: 'Restated brand search', note: 'changes existing rows' },
  { href: '/samples/fernhill-meta-export-with-errors.csv', label: 'Meta export with errors', note: 'several invalid rows' },
];

function issuesToCsv(issues: ImportIssue[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return ['line,severity,field,code,message', ...issues.map((i) => [i.line ?? '', i.severity, i.field ?? '', i.code, esc(i.message)].join(','))].join('\n');
}

export function ImportWizard({ clientId, clientName, currency, timezone }: { clientId: string; clientName: string; currency: string; timezone: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('file');
  const [file, setFile] = useState<{ name: string; size: number; text: string; parsed: ParsedCsv } | null>(null);
  const [source, setSource] = useState('');
  const [mapping, setMapping] = useState<ImportMapping>({ columns: {}, fixedChannel: null, dateFormat: 'YYYY-MM-DD' });
  const [channelMode, setChannelMode] = useState<'column' | 'fixed'>('column');
  const [dateHint, setDateHint] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [acceptRejected, setAcceptRejected] = useState(false);
  const [conflictPolicy, setConflictPolicy] = useState<'replace' | 'keep' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectiveMapping: ImportMapping = useMemo(
    () => ({
      ...mapping,
      columns: channelMode === 'fixed' ? { ...mapping.columns, channel: undefined } : mapping.columns,
      fixedChannel: channelMode === 'fixed' ? (mapping.fixedChannel ?? '') : null,
    }),
    [mapping, channelMode],
  );
  const mappingProblems = file ? validateMapping(effectiveMapping, file.parsed.headers) : [];
  const payload = () => ({ text: file!.text, fileName: file!.name, mapping: { ...effectiveMapping, columns: Object.fromEntries(Object.entries(effectiveMapping.columns).filter(([, v]) => v)) } });

  async function onFile(selected: File | undefined) {
    setError(null);
    setPreview(null);
    if (!selected) return;
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setError(`“${selected.name}” is ${(selected.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB; split the export into smaller date ranges.`);
      return;
    }
    const text = await selected.text();
    try {
      const parsed = parseCsv(text);
      const suggested = suggestMapping(parsed.headers);
      const dateColumn = suggested.columns.date ? parsed.headers.indexOf(suggested.columns.date) : -1;
      const detected = dateColumn >= 0 ? detectDateFormat(parsed.rows.slice(0, 50).map((r) => r.cells[dateColumn] ?? '')) : null;
      setFile({ name: selected.name, size: selected.size, text, parsed });
      setMapping({ ...suggested, dateFormat: detected ?? 'YYYY-MM-DD' });
      setChannelMode(suggested.columns.channel ? 'column' : 'fixed');
      setDateHint(dateColumn < 0 ? null : detected ? `Detected from the first rows: ${detected}.` : 'The dates are ambiguous or not recognised. Choose the format used in the file.');
      setAcceptRejected(false);
      setConflictPolicy(null);
    } catch (e) {
      setFile(null);
      if (e instanceof CsvStructureError) setError(`“${selected.name}” could not be read: ${e.message}`);
      else throw e;
    }
  }

  function runPreview() {
    startTransition(async () => {
      setError(null);
      const result = await previewImportAction(clientId, payload());
      if (!result.ok) return setError(result.error);
      if (!result.data.ok) return setError(result.data.fatal);
      setPreview(result.data.preview);
      setAcceptRejected(false);
      setConflictPolicy(null);
      setStep('preview');
    });
  }

  function commit() {
    startTransition(async () => {
      setError(null);
      const result = await commitImportAction(clientId, { ...payload(), source, conflictPolicy, acceptRejected });
      if (!result.ok) return setError(result.error);
      router.push(`/c/${clientId}/imports/${result.data.importId}?done=1`);
    });
  }

  const setColumn = (field: CanonicalField, header: string) => setMapping((m) => ({ ...m, columns: { ...m.columns, [field]: header || undefined } }));
  const sampleFor = (header: string | undefined) => {
    if (!file || !header) return '';
    const i = file.parsed.headers.indexOf(header);
    return file.parsed.rows.slice(0, 2).map((r) => r.cells[i] ?? '').filter(Boolean).join(' · ');
  };
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const money = (c: number) => formatMoney(c, currency);

  const willWrite = preview ? preview.plan.inserts + (conflictPolicy === 'replace' ? preview.plan.conflicts : 0) : 0;
  const needsRejectDecision = !!preview && preview.rejectedRows > 0;
  const needsConflictDecision = !!preview && preview.plan.conflicts > 0;
  const canCommit = !!preview && preview.validRows > 0 && source.trim().length > 0 && (!needsRejectDecision || acceptRejected) && (!needsConflictDecision || conflictPolicy !== null);

  return (
    <div>
      <ol className="mb-5 flex flex-wrap gap-x-1 gap-y-2 text-[0.84rem]" aria-label="Import steps">
        {STEPS.map((s, i) => {
          const state = i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo';
          return (
            <li key={s.id} aria-current={state === 'current' ? 'step' : undefined} className="flex items-center gap-1.5">
              <span
                className={`num flex h-6 w-6 items-center justify-center rounded-full border text-[0.76rem] font-semibold ${
                  state === 'current' ? 'border-brand bg-brand text-white' : state === 'done' ? 'border-brand-line bg-brand-soft text-brand' : 'border-line-strong text-ink-3'
                }`}
              >
                {state === 'done' ? <IconCheck size={12} /> : i + 1}
              </span>
              <span className={state === 'current' ? 'font-semibold' : 'muted'}>
                {s.label}
                {state === 'done' ? <span className="sr-only"> (completed)</span> : null}
              </span>
              {i < STEPS.length - 1 ? <span className="mx-1.5 hidden h-px w-6 bg-line-strong sm:block" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="mb-4">
          <Notice tone="danger" title="This file was not imported" live>
            {error} Nothing was changed; existing data is intact.
          </Notice>
        </div>
      ) : null}

      {/* ------------------------------ Step 1 ------------------------------ */}
      {step === 'file' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="panel" aria-labelledby="imp-file">
            <div className="panel-head">
              <h2 id="imp-file" className="panel-title">
                Choose a CSV file
              </h2>
            </div>
            <div className="panel-body space-y-4">
              <div>
                <label className="label" htmlFor="import-file">
                  Campaign export (.csv, up to 5 MB and {formatInteger(MAX_DATA_ROWS)} rows)
                </label>
                <input
                  ref={fileInput}
                  id="import-file"
                  type="file"
                  accept=".csv,text/csv"
                  className="block w-full cursor-pointer rounded-[6px] border border-dashed border-line-strong bg-white px-3 py-5 text-[0.9rem] file:mr-3 file:cursor-pointer file:rounded-[6px] file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:font-semibold"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
                <p className="hint">The file is checked in your browser first, then validated again on the server. Nothing is saved until you confirm.</p>
              </div>
              {file ? (
                <>
                  <Notice tone="ok" title={`${file.name} is readable`}>
                    {formatInteger(file.parsed.rows.length)} data rows, {file.parsed.headers.length} columns: {file.parsed.headers.join(', ')}.
                  </Notice>
                  <div>
                    <label className="label" htmlFor="import-source">
                      Where did this file come from?
                    </label>
                    <input className="input max-w-md" id="import-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={120} placeholder="e.g. Google Ads campaign report, downloaded 12 Nov" aria-describedby="import-source-hint" />
                    <p className="hint" id="import-source-hint">
                      Recorded with the import so anyone reading a report can trace its numbers.
                    </p>
                  </div>
                  <button type="button" className="btn btn-primary" disabled={!source.trim()} onClick={() => setStep('map')}>
                    Continue to mapping
                  </button>
                </>
              ) : null}
            </div>
          </section>
          <aside className="space-y-4 self-start">
            <section className="panel" aria-labelledby="imp-rules">
              <div className="panel-head">
                <h2 id="imp-rules" className="panel-title">
                  What a file needs
                </h2>
              </div>
              <ul className="list-disc space-y-1.5 px-4 py-3 pl-8 text-[0.84rem] marker:text-line-strong">
                <li>One row per day, channel and campaign. Aggregate ad-level rows first.</li>
                <li>
                  Amounts in <strong>{currency}</strong>, this client’s currency. Other currencies are rejected, never converted.
                </li>
                <li>
                  Dates as calendar days in <strong>{timezone}</strong>.
                </li>
                <li>A blank number is an error, not a zero.</li>
              </ul>
            </section>
            <section className="panel" aria-labelledby="imp-samples">
              <div className="panel-head">
                <h2 id="imp-samples" className="panel-title">
                  Sample files
                </h2>
              </div>
              <ul className="space-y-2 px-4 py-3 text-[0.84rem]">
                {SAMPLES.map((s) => (
                  <li key={s.href}>
                    <a href={s.href} download className="link inline-flex items-center gap-1">
                      <IconDownload size={13} />
                      {s.label}
                    </a>
                    <span className="muted"> · {s.note}</span>
                  </li>
                ))}
              </ul>
              <p className="muted border-t border-line px-4 py-2.5 text-[0.78rem]">Synthetic USD data for the demo client Fernhill Outdoor.</p>
            </section>
          </aside>
        </div>
      ) : null}

      {/* ------------------------------ Step 2 ------------------------------ */}
      {step === 'map' && file ? (
        <section className="panel" aria-labelledby="imp-map">
          <div className="panel-head">
            <div>
              <h2 id="imp-map" className="panel-title">
                Map the file’s columns
              </h2>
              <p className="muted mt-0.5 text-[0.84rem]">We suggested matches from the header names in {file.name}. Check each one; nothing is assumed silently.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Column mapping</caption>
              <thead>
                <tr>
                  <th scope="col">CampaignLens field</th>
                  <th scope="col">Column in your file</th>
                  <th scope="col">First values</th>
                </tr>
              </thead>
              <tbody>
                {CANONICAL_FIELDS.map(({ field, label, required, help }) => {
                  const isChannel = field === 'channel';
                  const value = isChannel && channelMode === 'fixed' ? FIXED : (mapping.columns[field] ?? '');
                  return (
                    <tr key={field}>
                      <th scope="row" className="!bg-transparent !text-[0.86rem] !font-normal !normal-case !tracking-normal !text-ink w-[34%] !whitespace-normal">
                        <label htmlFor={`map-${field}`} className="font-semibold">
                          {label}
                        </label>{' '}
                        {required ? <span className="badge">Required</span> : <span className="muted text-[0.76rem]">Optional</span>}
                        <span className="muted mt-0.5 block text-[0.78rem]">{help}</span>
                      </th>
                      <td className="min-w-[13rem]">
                        <select
                          id={`map-${field}`}
                          className="select"
                          value={value}
                          onChange={(e) => {
                            if (isChannel) {
                              setChannelMode(e.target.value === FIXED ? 'fixed' : 'column');
                              if (e.target.value !== FIXED) setColumn('channel', e.target.value);
                            } else setColumn(field, e.target.value);
                          }}
                        >
                          <option value="">{required && !isChannel ? 'Choose a column…' : isChannel ? 'Choose a column…' : 'Not in this file'}</option>
                          {isChannel ? <option value={FIXED}>One channel for the whole file</option> : null}
                          {file.parsed.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                        {isChannel && channelMode === 'fixed' ? (
                          <div className="mt-2">
                            <label className="label" htmlFor="map-fixed-channel">
                              Channel name for every row
                            </label>
                            <input className="input" id="map-fixed-channel" value={mapping.fixedChannel ?? ''} onChange={(e) => setMapping((m) => ({ ...m, fixedChannel: e.target.value }))} placeholder="e.g. Google Ads" maxLength={120} />
                          </div>
                        ) : null}
                        {field === 'date' ? (
                          <div className="mt-2">
                            <label className="label" htmlFor="map-date-format">
                              Date format
                            </label>
                            <select id="map-date-format" className="select" value={mapping.dateFormat} onChange={(e) => setMapping((m) => ({ ...m, dateFormat: e.target.value as DateFormat }))}>
                              {DATE_FORMATS.map((f) => (
                                <option key={f}>{f}</option>
                              ))}
                            </select>
                            {dateHint ? <p className="hint">{dateHint}</p> : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="num muted max-w-[16rem] break-words text-[0.82rem]">{isChannel && channelMode === 'fixed' ? (mapping.fixedChannel ?? '') : sampleFor(mapping.columns[field])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 border-t border-line px-4 py-3.5">
            {mappingProblems.length ? (
              <Notice tone="warn" title="Finish the mapping to continue">
                <ul className="list-disc pl-4">
                  {mappingProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => setStep('file')}>
                Back
              </button>
              <button type="button" className="btn btn-primary" disabled={pending || mappingProblems.length > 0} onClick={runPreview}>
                {pending ? 'Checking every row…' : 'Check file and preview'}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------ Step 3 ------------------------------ */}
      {step === 'preview' && preview ? (
        <div className="space-y-5">
          <section className="panel" aria-labelledby="imp-preview">
            <div className="panel-head">
              <h2 id="imp-preview" className="panel-title">
                How {preview.fileName} was read
              </h2>
              <span className={`badge ${preview.rejectedRows ? 'badge-warn' : 'badge-ok'}`}>
                {preview.rejectedRows ? <IconAlert size={12} /> : <IconCheck size={12} />}
                {preview.rejectedRows ? `${preview.rejectedRows} rows have errors` : 'All rows are valid'}
              </span>
            </div>
            <dl className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
              {[
                { t: 'Rows in file', v: formatInteger(preview.rowsInFile) },
                { t: 'Valid rows', v: formatInteger(preview.validRows) },
                { t: 'Rows with errors', v: formatInteger(preview.rejectedRows) },
                { t: 'Warnings', v: formatInteger(preview.warningCount) },
              ].map((s) => (
                <div key={s.t} className="border-r border-line px-4 py-3 last:border-r-0">
                  <dt className="eyebrow">{s.t}</dt>
                  <dd className="num mt-1 text-[1.25rem] font-semibold">{s.v}</dd>
                </div>
              ))}
            </dl>
            <dl className="grid gap-x-8 gap-y-2 px-4 py-3 text-[0.88rem] sm:grid-cols-2">
              <div>
                <dt className="muted">Reporting coverage of valid rows</dt>
                <dd>{preview.coverage ? formatDateRange(preview.coverage.from, preview.coverage.to) : 'No valid rows'}</dd>
              </div>
              <div>
                <dt className="muted">Channels</dt>
                <dd>{preview.channels.join(', ') || 'None'}</dd>
              </div>
              <div>
                <dt className="muted">Currency and timezone applied</dt>
                <dd>
                  {preview.currency} · {preview.timezone}
                </dd>
              </div>
              <div>
                <dt className="muted">Compared with data already stored for {clientName}</dt>
                <dd>
                  {formatInteger(preview.plan.inserts)} new · {formatInteger(preview.plan.unchanged)} identical · {formatInteger(preview.plan.conflicts)} with different values
                </dd>
              </div>
            </dl>
          </section>

          <section className="panel" aria-labelledby="imp-records">
            <div className="panel-head">
              <div>
                <h2 id="imp-records" className="panel-title">
                  Normalized records
                </h2>
                <p className="muted mt-0.5 text-[0.84rem]">
                  The first {Math.min(preview.sample.length, preview.validRows)} of {formatInteger(preview.validRows)} valid rows, exactly as they would be stored.
                </p>
              </div>
            </div>
            {preview.sample.length ? (
              <div className="table-wrap max-h-[26rem] overflow-y-auto">
                <table className="table">
                  <caption className="sr-only">Preview of normalized records</caption>
                  <thead className="sticky top-0">
                    <tr>
                      <th scope="col" className="r">
                        File row
                      </th>
                      <th scope="col">Date</th>
                      <th scope="col">Channel</th>
                      <th scope="col">Campaign</th>
                      {['Spend', 'Impressions', 'Clicks', 'Conversions', 'Revenue'].map((h) => (
                        <th key={h} scope="col" className="r">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((r) => (
                      <tr key={r.line}>
                        <td className="r muted">{r.line}</td>
                        <td className="num whitespace-nowrap">{formatDate(r.date)}</td>
                        <td>{r.channel}</td>
                        <td className="max-w-[18rem] [overflow-wrap:anywhere]">{r.campaign}</td>
                        <td className="r">{money(r.spendCents)}</td>
                        <td className="r">{formatInteger(r.impressions)}</td>
                        <td className="r">{formatInteger(r.clicks)}</td>
                        <td className="r">{formatCount(r.conversions)}</td>
                        <td className="r">{money(r.revenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted px-4 py-5 text-[0.9rem]">No row passed validation. Review the errors on the next step, fix the file and try again.</p>
            )}
          </section>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setStep('map')}>
              Back to mapping
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep('confirm')}>
              {preview.errorCount + preview.warningCount ? `Review ${preview.errorCount + preview.warningCount} issue(s)` : 'Continue to confirm'}
            </button>
          </div>
        </div>
      ) : null}

      {/* ------------------------------ Step 4 ------------------------------ */}
      {step === 'confirm' && preview ? (
        <div className="space-y-5">
          <section className="panel" aria-labelledby="imp-issues">
            <div className="panel-head">
              <div>
                <h2 id="imp-issues" className="panel-title">
                  Errors and warnings
                </h2>
                <p className="muted mt-0.5 text-[0.84rem]">
                  {preview.errorCount} error(s) on {preview.rejectedRows} row(s), {preview.warningCount} warning(s). Rows with errors are never imported; rows with only warnings are.
                </p>
              </div>
              {preview.issues.length ? (
                <a className="btn btn-sm" href={`data:text/csv;charset=utf-8,${encodeURIComponent(issuesToCsv(preview.issues))}`} download={`${preview.fileName.replace(/\.csv$/i, '')}-issues.csv`}>
                  <IconDownload size={13} />
                  Download issues
                </a>
              ) : null}
            </div>
            {preview.issues.length ? (
              <div className="table-wrap max-h-[24rem] overflow-y-auto">
                <table className="table">
                  <caption className="sr-only">Validation issues by file row</caption>
                  <thead className="sticky top-0">
                    <tr>
                      <th scope="col" className="r">
                        File row
                      </th>
                      <th scope="col">Type</th>
                      <th scope="col">Field</th>
                      <th scope="col">What is wrong</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.issues.map((issue, n) => (
                      <tr key={n}>
                        <td className="r">{issue.line ?? 'File'}</td>
                        <td>
                          <span className={`badge ${issue.severity === 'error' ? 'badge-danger' : 'badge-warn'}`}>{issue.severity === 'error' ? 'Error' : 'Warning'}</span>
                        </td>
                        <td className="capitalize">{issue.field ?? ''}</td>
                        <td className="[overflow-wrap:anywhere]">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-4 text-[0.9rem]">No errors or warnings were found.</p>
            )}
            {preview.issuesTruncated ? <p className="muted border-t border-line px-4 py-2 text-[0.8rem]">Only the first 200 issues are listed. Fixing the file is likely quicker than reviewing them all.</p> : null}
          </section>

          <section className="panel" aria-labelledby="imp-confirm">
            <div className="panel-head">
              <h2 id="imp-confirm" className="panel-title">
                Confirm the import
              </h2>
            </div>
            <div className="panel-body space-y-4">
              {preview.previousImportOfSameFile ? (
                <Notice title="This exact file was imported before">
                  Imported on {new Date(preview.previousImportOfSameFile.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} by {preview.previousImportOfSameFile.by}. Importing it again is safe: identical rows are left
                  untouched.
                </Notice>
              ) : null}

              {needsRejectDecision ? (
                <fieldset className="rounded-[6px] border border-line-strong p-3.5">
                  <legend className="px-1 text-[0.9rem] font-semibold">
                    {preview.rejectedRows} row(s) have errors and will not be imported
                  </legend>
                  <label className="flex items-start gap-2.5 text-[0.9rem]">
                    <input type="checkbox" className="mt-1" checked={acceptRejected} onChange={(e) => setAcceptRejected(e.target.checked)} />
                    <span>
                      Import the {formatInteger(preview.validRows)} valid rows and leave these {preview.rejectedRows} out. The rejected rows and reasons are kept on the import record. Totals for the affected dates will be incomplete until a
                      corrected file is imported.
                    </span>
                  </label>
                </fieldset>
              ) : null}

              {needsConflictDecision ? (
                <fieldset className="rounded-[6px] border border-line-strong p-3.5">
                  <legend className="px-1 text-[0.9rem] font-semibold">
                    {preview.plan.conflicts} row(s) already exist with different values
                  </legend>
                  <p className="muted mb-2 text-[0.84rem]">
                    For example {preview.conflictSample.slice(0, 2).map((c) => `${formatDate(c.date, { year: false })} ${c.campaign}: stored spend ${money(c.existingSpendCents)}, file has ${money(c.incomingSpendCents)}`).join('; ')}.
                  </p>
                  <div className="space-y-1.5 text-[0.9rem]">
                    <label className="flex items-start gap-2.5">
                      <input type="radio" name="conflict" className="mt-1" checked={conflictPolicy === 'replace'} onChange={() => setConflictPolicy('replace')} />
                      <span>
                        <strong>Replace</strong> the stored values with the values in this file (use for corrected or restated exports).
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5">
                      <input type="radio" name="conflict" className="mt-1" checked={conflictPolicy === 'keep'} onChange={() => setConflictPolicy('keep')} />
                      <span>
                        <strong>Keep</strong> the stored values and skip these rows.
                      </span>
                    </label>
                  </div>
                </fieldset>
              ) : null}

              <div className="rounded-[6px] bg-sunken px-3.5 py-3 text-[0.9rem]">
                <p className="font-semibold">What will happen</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 marker:text-line-strong">
                  <li>{formatInteger(preview.plan.inserts)} new row(s) added.</li>
                  {preview.plan.conflicts ? <li>{conflictPolicy === 'replace' ? `${preview.plan.conflicts} existing row(s) replaced.` : conflictPolicy === 'keep' ? `${preview.plan.conflicts} existing row(s) kept as they are.` : `${preview.plan.conflicts} existing row(s): choose replace or keep above.`}</li> : null}
                  {preview.plan.unchanged ? <li>{formatInteger(preview.plan.unchanged)} identical row(s) left untouched.</li> : null}
                  {preview.rejectedRows ? <li>{preview.rejectedRows} row(s) with errors not imported.</li> : null}
                  <li>
                    Source recorded as “{source}”, in {preview.currency}, {preview.timezone}.
                  </li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn" onClick={() => setStep('preview')}>
                  Back
                </button>
                <button type="button" className="btn btn-primary" disabled={!canCommit || pending} onClick={commit}>
                  <IconUpload size={14} />
                  {pending ? 'Importing…' : willWrite ? `Import ${formatInteger(willWrite)} row(s)` : 'Record import (no changes)'}
                </button>
                <Link href={`/c/${clientId}/imports`} className="btn btn-quiet">
                  Cancel
                </Link>
                {preview.validRows === 0 ? <span className="field-error !mt-0">There are no valid rows to import.</span> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
