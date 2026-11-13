import type { Metadata } from 'next';
import { can } from '@/lib/auth/permissions';
import { clientPage } from '@/lib/page';
import { PageHeader } from '@/components/ui/primitives';
import { ClientSettingsForm, DeleteClientSection } from '@/components/workspace/client-forms';

export const metadata: Metadata = { title: 'Client settings' };

export default async function ClientSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { actor, data } = await clientPage(params);
  const { client } = data;
  return (
    <>
      <PageHeader title="Client settings" description={`${client.name} · how this workspace reads data, brands reports and decides what to flag.`} />
      <div className="max-w-5xl space-y-6">
        <ClientSettingsForm
          client={{ id: client.id, name: client.name, currency: client.currency, timezone: client.timezone, conversionDefinition: client.conversionDefinition, branding: client.branding, thresholds: client.thresholds }}
          timezones={Intl.supportedValuesOf('timeZone')}
          canEdit={can(actor.role, 'client:update')}
          hasData={data.rows.length > 0}
        />
        {can(actor.role, 'client:delete') ? <DeleteClientSection clientId={client.id} clientName={client.name} /> : null}
      </div>
    </>
  );
}
