import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDateRange, formatInteger } from '@/lib/analytics';
import { requireActor } from '@/lib/auth/session';
import { formatTimestamp } from '@/lib/format-time';
import { CANONICAL_FIELDS } from '@/lib/import/mapping';
import { orNotFound } from '@/lib/page';
import { getClient } from '@/lib/services/clients';
import { getImport } from '@/lib/services/imports';
import { DefinitionList, Notice, PageHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Import summary' };

export default async function ImportDetailPage({ params, searchParams }: { params: Promise<{ clientId: string; importId: string }>; searchParams: Promise<{ done?: string }> }) {
  const actor = await requireActor();
  const { clientId, importId } = await params;
  const [client, record] = await orNotFound(() => Promise.all([getClient(actor, clientId), getImport(actor, clientId, importId)]));
  const { done } = await searchParams;
  const base = `/c/${client.id}`;
  const changed = record.inserted + record.replaced;
  const coverage = record.coverageStart && record.coverageEnd ? { from: record.coverageStart, to: record.coverageEnd } : null;
  const mapped = CANONICAL_FIELDS.map((f) => ({ label: f.label, column: record.mapping.columns[f.field] })).filter((m) => m.column);
  const counts = [
    { t: 'Rows in file', v: record.rowsInFile },
    { t: 'Added', v: record.inserted },
    { t: 'Replaced', v: record.replaced },
    { t: 'Identical, untouched', v: record.unchanged },
    { t: 'Kept existing', v: record.keptExisting },
    { t: 'Rejected', v: record.rejected },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="muted mb-2 text-[0.84rem]">
        <Link href={`${base}/imports`} className="link">
          Imports
        </Link>{' '}
        / Summary
      </nav>
      <PageHeader
        title="Import summary"
        description={`${record.fileName} · ${client.name}`}
        actions={
          <>
            <Link href={`${base}/imports/new`} className="btn">
              Import another file
            </Link>
            {coverage ? (
              <Link href={`${base}?from=${coverage.from}&to=${coverage.to}`} className="btn btn-primary">
                View this period
              </Link>
            ) : null}
          </>
        }
      />
      <div className="space-y-5">
        {done ? (
          <Notice tone="ok" title={changed ? `Import complete: ${formatInteger(changed)} row(s) written` : 'Import recorded: no rows needed to change'} live>
            {record.rejected ? `${record.rejected} row(s) with errors were left out and are listed below. ` : ''}
            Dashboards, pacing and the investigation queue now include this data. Draft reports keep their captured data until you refresh them.
          </Notice>
        ) : null}

        <section className="panel" aria-labelledby="imp-counts">
          <div className="panel-head">
            <h2 id="imp-counts" className="panel-title">
              Row counts
            </h2>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
            {counts.map((c) => (
              <div key={c.t} className="border-b border-r border-line px-4 py-3 last:border-r-0 xl:border-b-0">
                <dt className="eyebrow">{c.t}</dt>
                <dd className="num mt-1 text-[1.25rem] font-semibold">{formatInteger(c.v)}</dd>
              </div>
            ))}
          </dl>
          <p className="muted border-t border-line px-4 py-2.5 text-[0.8rem]">
            Added + replaced + identical + kept existing + rejected = rows in file ({formatInteger(record.inserted + record.replaced + record.unchanged + record.keptExisting + record.rejected)} of {formatInteger(record.rowsInFile)}). No row is
            dropped without being counted here.
          </p>
        </section>

        <section className="panel" aria-labelledby="imp-prov">
          <div className="panel-head">
            <h2 id="imp-prov" className="panel-title">
              Provenance
            </h2>
          </div>
          <div className="panel-body">
            <DefinitionList
              items={[
                { term: 'Source', value: record.source },
                { term: 'File', value: record.fileName },
                { term: 'Imported', value: `${formatTimestamp(record.createdAt)} by ${record.createdByName}` },
                { term: 'Reporting coverage', value: coverage ? formatDateRange(coverage.from, coverage.to) : 'No valid rows' },
                { term: 'Currency', value: record.currency },
                { term: 'Reporting timezone', value: record.timezone },
                { term: 'Existing rows', value: record.conflictPolicy === 'replace' ? 'Replaced when the file had different values' : 'Kept when the file had different values' },
                { term: 'Column mapping', value: mapped.length ? mapped.map((m) => `${m.label} ← ${m.column}`).join('; ') + (record.mapping.fixedChannel ? `; Channel = “${record.mapping.fixedChannel}”` : '') : 'Generated dataset (no file columns)' },
                { term: 'File fingerprint', value: <span className="num break-all text-[0.8rem]">{record.fileHash.slice(0, 16)}</span> },
              ]}
            />
          </div>
        </section>

        <section className="panel" aria-labelledby="imp-issues">
          <div className="panel-head">
            <h2 id="imp-issues" className="panel-title">
              Errors and warnings
            </h2>
            <span className="muted text-[0.84rem]">
              {record.errorCount} error(s), {record.warningCount} warning(s)
            </span>
          </div>
          {record.issues.length ? (
            <div className="table-wrap max-h-[28rem] overflow-y-auto">
              <table className="table">
                <caption className="sr-only">Issues found in this file</caption>
                <thead className="sticky top-0">
                  <tr>
                    <th scope="col" className="r">
                      File row
                    </th>
                    <th scope="col">Type</th>
                    <th scope="col">Field</th>
                    <th scope="col">What was wrong</th>
                  </tr>
                </thead>
                <tbody>
                  {record.issues.map((issue, n) => (
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
            <p className="px-4 py-4 text-[0.9rem]">No errors or warnings.</p>
          )}
        </section>
      </div>
    </>
  );
}
