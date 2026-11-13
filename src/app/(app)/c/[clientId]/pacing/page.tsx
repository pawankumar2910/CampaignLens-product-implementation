import type { Metadata } from 'next';
import { budgetLabel, campaignKey, formatDate, formatDateRange, pacingForBudget, type BudgetPacing } from '@/lib/analytics';
import { can } from '@/lib/auth/permissions';
import { clientPage } from '@/lib/page';
import { toBudgetDef } from '@/lib/services/workspace';
import { EmptyState, Notice, PageHeader } from '@/components/ui/primitives';
import { AddBudgetButton, DeleteBudgetButton } from '@/components/workspace/budget-forms';
import { PacingCard } from '@/components/workspace/pacing';

export const metadata: Metadata = { title: 'Budget pacing' };

export default async function PacingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { actor, data } = await clientPage(params);
  const { client } = data;
  const canEdit = can(actor.role, 'budget:write');
  // Pacing counts spend through the last day that has data, so a day that is not imported yet is not read as zero spend.
  const asOf = data.bounds && data.bounds.to < data.today ? data.bounds.to : data.today;
  const paced = data.budgets
    .map((b) => ({ row: b, pacing: pacingForBudget(data.rows, toBudgetDef(b), asOf) }))
    .filter((b): b is { row: (typeof data.budgets)[number]; pacing: BudgetPacing } => b.pacing !== null);
  const groups = [
    { title: 'In progress', items: paced.filter((b) => b.pacing.pacing.phase === 'in_progress') },
    { title: 'Upcoming', items: paced.filter((b) => b.pacing.pacing.phase === 'not_started') },
    { title: 'Finished', items: paced.filter((b) => b.pacing.pacing.phase === 'complete').reverse() },
  ].filter((g) => g.items.length);

  const campaigns = [...new Map(data.rows.map((r) => [campaignKey(r.channel, r.campaign), { key: campaignKey(r.channel, r.campaign), channel: r.channel, campaign: r.campaign }])).values()].sort((a, b) =>
    `${a.channel}${a.campaign}`.localeCompare(`${b.channel}${b.campaign}`),
  );
  const addButton = canEdit ? <AddBudgetButton clientId={client.id} currency={client.currency} campaigns={campaigns} defaultMonth={asOf.slice(0, 7)} /> : undefined;

  return (
    <>
      <PageHeader
        title="Budget pacing"
        description={`${client.name} · observed spend against each budget, counted through ${formatDate(asOf)}${data.bounds && data.bounds.to < data.today ? ' (the last day with imported data)' : ''}.`}
        actions={addButton}
      />
      {paced.length === 0 ? (
        <EmptyState title="No budgets yet" action={addButton}>
          {canEdit
            ? 'Add a budget for the whole client or for one campaign. You will see observed spend, where even pacing would be today, the remaining budget and a linear projection.'
            : 'No budgets have been set for this client. Ask an analyst or owner to add one.'}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {data.bounds && data.bounds.to < data.today ? (
            <Notice title={`Data ends ${formatDate(data.bounds.to)}`}>Today in {client.timezone} is {formatDate(data.today)}. Import newer exports to bring pacing up to date.</Notice>
          ) : null}
          {groups.map((g) => (
            <section key={g.title} aria-label={`${g.title} budgets`}>
              <h2 className="eyebrow mb-2">{g.title}</h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {g.items.map(({ row, pacing }) => (
                  <div key={row.id} className="panel p-4">
                    <PacingCard budget={pacing} currency={client.currency} tolerance={client.thresholds.pacingTolerancePct} compact />
                    {canEdit ? (
                      <div className="-mb-1 -mr-1 mt-2 flex justify-end border-t border-line pt-2">
                        <DeleteBudgetButton clientId={client.id} budgetId={row.id} label={`${budgetLabel(toBudgetDef(row))}, ${formatDateRange(row.periodStart, row.periodEnd)}`} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
          <p className="muted max-w-3xl text-[0.82rem]">
            Expected spend is the budget spread evenly across the period. The linear projection extends average daily spend so far to the end of the period. Neither accounts for planned changes, seasonality or daily caps, so
            treat them as a reference point for the conversation, not a forecast.
          </p>
        </div>
      )}
    </>
  );
}
