import Link from 'next/link';
import { campaignKey, KIND_LABEL, type InvestigationItem, type Priority } from '@/lib/analytics';

const PRIORITY: Record<Priority, { label: string; badge: string; mark: string }> = {
  high: { label: 'High priority', badge: 'badge-danger', mark: '▲' },
  medium: { label: 'Medium priority', badge: 'badge-warn', mark: '◆' },
  low: { label: 'Low priority', badge: '', mark: '●' },
};

/** Stable, URL-safe element id for an item, used for in-page links from the overview. */
export const queueAnchor = (id: string): string => 'q-' + id.replace(/[^a-zA-Z0-9]+/g, '-');

/** Priority as text plus a distinct shape, so it reads without colour. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITY[priority];
  return (
    <span className={`badge ${p.badge}`}>
      <span aria-hidden="true" className="text-[0.6rem]">
        {p.mark}
      </span>
      {p.label}
    </span>
  );
}

/** Full investigation item: rule, comparison, numbers, data sufficiency and next check. */
export function QueueItem({ item, clientPath, rangeQuery }: { item: InvestigationItem; clientPath?: string; rangeQuery?: string }) {
  const hasPrevious = item.evidence.some((e) => e.previous !== null);
  return (
    <article className="panel scroll-mt-4 target:ring-2 target:ring-brand" aria-labelledby={queueAnchor(item.id)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-3.5">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={item.priority} />
            <span className="badge">{KIND_LABEL[item.kind]}</span>
          </div>
          <h3 id={queueAnchor(item.id)} className="text-[0.98rem] font-semibold [overflow-wrap:anywhere]">
            {item.title}
          </h3>
        </div>
        {clientPath && item.channel && item.campaign ? (
          <Link href={`${clientPath}/campaigns/${encodeURIComponent(campaignKey(item.channel, item.campaign))}${rangeQuery ?? ''}`} className="btn btn-sm shrink-0">
            Open campaign
          </Link>
        ) : null}
      </div>
      <div className="grid gap-x-8 gap-y-3 px-4 pb-4 pt-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="table-wrap self-start rounded-[6px] border border-line">
          <table className="table">
            <caption className="sr-only">Supporting numbers</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col" className="r">
                  {hasPrevious ? 'This period' : 'Value'}
                </th>
                {hasPrevious ? (
                  <>
                    <th scope="col" className="r">
                      Previous
                    </th>
                    <th scope="col" className="r">
                      Change
                    </th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {item.evidence.map((e) => (
                <tr key={e.label}>
                  <td>{e.label}</td>
                  <td className="r font-semibold">{e.current}</td>
                  {hasPrevious ? (
                    <>
                      <td className="r">{e.previous ?? ''}</td>
                      <td className="r">{e.change ?? ''}</td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="space-y-2.5 text-[0.86rem]">
          <div>
            <dt className="eyebrow">Why this is flagged</dt>
            <dd className="mt-0.5">{item.condition}</dd>
          </div>
          <div>
            <dt className="eyebrow">Compared</dt>
            <dd className="mt-0.5">{item.comparison}</dd>
          </div>
          <div>
            <dt className="eyebrow">How much to trust it</dt>
            <dd className="mt-0.5">{item.sufficiency}</dd>
          </div>
          <div className="rounded-[6px] border border-brand-line bg-brand-soft px-3 py-2">
            <dt className="eyebrow !text-brand">Next check</dt>
            <dd className="mt-0.5 text-brand-strong">{item.nextCheck}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

/** Compact list for the overview: title and priority, linking to the full queue. */
export function QueueList({ items, href, limit = 5 }: { items: InvestigationItem[]; href: string; limit?: number }) {
  if (!items.length) {
    return <p className="muted px-4 py-5 text-[0.9rem]">No rules were triggered for this period. That is not proof that nothing changed: thresholds and minimum volumes are set in Client settings.</p>;
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {items.slice(0, limit).map((item) => (
          <li key={item.id} className="px-4 py-2.5">
            <Link href={`${href}#${queueAnchor(item.id)}`} className="group block no-underline">
              <span className="mb-1 flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={item.priority} />
                <span className="muted text-[0.76rem]">{KIND_LABEL[item.kind]}</span>
              </span>
              <span className="block text-[0.9rem] font-semibold [overflow-wrap:anywhere] group-hover:underline">{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > limit ? (
        <p className="border-t border-line px-4 py-2.5 text-[0.86rem]">
          <Link href={href} className="link">
            View all {items.length} items
          </Link>
        </p>
      ) : null}
    </>
  );
}
