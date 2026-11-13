import type { ReactNode } from 'react';
import type { Change, RateChange } from '@/lib/analytics';
import { formatChange, formatPoints } from '@/lib/analytics';
import { IconAlert, IconArrowDown, IconArrowUp, IconCheck, IconInfo, IconMinus } from './icons';

type Tone = 'info' | 'warn' | 'danger' | 'ok';
const TONE_ICON = { info: IconInfo, warn: IconAlert, danger: IconAlert, ok: IconCheck } as const;
const TONE_LABEL = { info: 'Note', warn: 'Warning', danger: 'Error', ok: 'Done' } as const;

/** Inline message. The icon and the visually hidden label carry the meaning, not just the colour. */
export function Notice({ tone = 'info', title, children, live }: { tone?: Tone; title?: string; children?: ReactNode; live?: boolean }) {
  const Icon = TONE_ICON[tone];
  return (
    <div className={`notice notice-${tone}`} role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined}>
      <Icon className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="sr-only">{TONE_LABEL[tone]}: </span>
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : ''}>{children}</div> : null}
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="display text-[1.7rem]">{title}</h1>
        {description ? <p className="muted mt-1 max-w-2xl text-[0.92rem]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** An empty state always says what is missing and offers the next concrete step. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel px-6 py-10 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      {children ? <div className="muted mx-auto mt-1.5 max-w-md text-[0.9rem]">{children}</div> : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * Period-over-period change. `better` says which direction is an improvement so the
 * tone is meaningful; spend has no better direction and stays neutral. Direction is
 * always shown with an arrow and a signed number, so it never depends on colour.
 */
export function Delta({ change, better = 'none', points }: { change: Change | RateChange; better?: 'up' | 'down' | 'none'; points?: boolean }) {
  const text = points && 'points' in change ? formatPoints(change) : formatChange(change);
  if (change.state === 'unavailable') return <span className="muted num text-[0.8rem]" title="Not available for one of the periods">N/A</span>;
  if (change.state === 'new') return <span className="badge badge-info">New</span>;
  const delta = change.delta ?? 0;
  const flat = change.state === 'flat' || Math.abs(change.pct ?? 0) < 0.0005;
  const up = delta > 0;
  const good = better === 'none' || flat ? null : (better === 'up') === up;
  const tone = good === null ? 'text-ink-2' : good ? 'text-ok' : 'text-danger';
  const Icon = flat ? IconMinus : up ? IconArrowUp : IconArrowDown;
  return (
    <span className={`num inline-flex items-center gap-0.5 whitespace-nowrap text-[0.8rem] font-semibold ${tone}`}>
      <Icon size={12} />
      {text}
      <span className="sr-only">{flat ? ' (no change)' : up ? ' (increase)' : ' (decrease)'}</span>
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-[1.35rem] font-semibold leading-tight">{value}</p>
      {sub ? <div className="mt-1 text-[0.8rem]">{sub}</div> : null}
    </div>
  );
}

export function DefinitionList({ items }: { items: Array<{ term: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-[0.88rem]">
      {items.map((i) => (
        <div key={i.term} className="contents">
          <dt className="muted">{i.term}</dt>
          <dd className="min-w-0 break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
