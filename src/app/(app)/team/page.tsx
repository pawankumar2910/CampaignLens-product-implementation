import type { Metadata } from 'next';
import { can, ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/auth/permissions';
import { requireActor } from '@/lib/auth/session';
import { formatTimestamp } from '@/lib/format-time';
import { listInvitations, listMembers } from '@/lib/services/members';
import { Notice, PageHeader } from '@/components/ui/primitives';
import { InviteForm, MemberRoleSelect, RemoveMemberButton, RevokeInvitationButton } from '@/components/workspace/team';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage() {
  const actor = await requireActor();
  const manage = can(actor.role, 'member:manage');
  const [members, invitations] = await Promise.all([listMembers(actor), manage ? listInvitations(actor) : Promise.resolve([])]);
  const roles = ['owner', 'analyst', 'viewer'] as const;

  return (
    <>
      <PageHeader title="Team" description={`People who can access ${actor.agencyName}. Roles are checked on the server for every request, not just hidden in the interface.`} />
      <div className="max-w-5xl space-y-5">
        <section className="panel" aria-labelledby="team-members">
          <div className="panel-head">
            <h2 id="team-members" className="panel-title">
              Members
            </h2>
            <span className="badge num">{members.length}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Agency members</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Joined</th>
                  {manage ? (
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId}>
                    <th scope="row" className="!bg-transparent !text-[0.88rem] !font-semibold !normal-case !tracking-normal !text-ink">
                      {m.name}
                      {m.userId === actor.userId ? <span className="muted font-normal"> (you)</span> : null}
                    </th>
                    <td className="[overflow-wrap:anywhere]">{actor.isDemo ? <span className="muted">Guest account</span> : m.email}</td>
                    <td>{manage && !actor.isDemo ? <MemberRoleSelect membershipId={m.membershipId} name={m.name} role={m.role} /> : ROLE_LABEL[m.role]}</td>
                    <td className="num whitespace-nowrap">{formatTimestamp(m.joinedAt)}</td>
                    {manage ? <td className="text-right">{m.userId !== actor.userId && !actor.isDemo ? <RemoveMemberButton membershipId={m.membershipId} name={m.name} /> : null}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="team-roles">
          <div className="panel-head">
            <h2 id="team-roles" className="panel-title">
              What each role can do
            </h2>
          </div>
          <dl className="divide-y divide-line">
            {roles.map((r) => (
              <div key={r} className="grid gap-x-4 px-4 py-2.5 text-[0.88rem] sm:grid-cols-[7rem_1fr]">
                <dt className="font-semibold">{ROLE_LABEL[r]}</dt>
                <dd className="muted">{ROLE_DESCRIPTION[r]}</dd>
              </div>
            ))}
          </dl>
        </section>

        {actor.isDemo ? (
          <Notice title="Invitations are turned off in the demo">Each demo sandbox belongs to one visitor. Create a real workspace to invite colleagues as owners, analysts or viewers.</Notice>
        ) : manage ? (
          <section className="panel" aria-labelledby="team-invite">
            <div className="panel-head">
              <h2 id="team-invite" className="panel-title">
                Invite someone
              </h2>
            </div>
            <div className="panel-body">
              <InviteForm />
            </div>
            {invitations.length ? (
              <div className="table-wrap border-t border-line">
                <table className="table">
                  <caption className="px-4 pb-1 pt-3 text-left text-[0.8rem] font-semibold text-ink-2">Pending invitations</caption>
                  <thead>
                    <tr>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      <th scope="col">Expires</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((i) => (
                      <tr key={i.id}>
                        <td className="[overflow-wrap:anywhere]">{i.email}</td>
                        <td>{ROLE_LABEL[i.role]}</td>
                        <td className="num whitespace-nowrap">{formatTimestamp(i.expiresAt)}</td>
                        <td className="text-right">
                          <RevokeInvitationButton invitationId={i.id} email={i.email} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : (
          <Notice>Only agency owners can invite people or change roles.</Notice>
        )}
      </div>
    </>
  );
}
