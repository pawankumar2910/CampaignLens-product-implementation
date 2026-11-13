'use client';

import { useState, useTransition } from 'react';
import { createInvitationAction, removeMemberAction, revokeInvitationAction, updateMemberRoleAction } from '@/lib/actions/account';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/auth/permissions';
import type { Role } from '@/lib/db/schema';
import { formatTimestamp } from '@/lib/format-time';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Notice } from '@/components/ui/primitives';

const ROLES: Role[] = ['owner', 'analyst', 'viewer'];

export function MemberRoleSelect({ membershipId, name, role }: { membershipId: string; name: string; role: Role }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <label className="sr-only" htmlFor={`role-${membershipId}`}>
        Role for {name}
      </label>
      <select
        id={`role-${membershipId}`}
        className="select w-32"
        value={role}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            setError(null);
            const result = await updateMemberRoleAction(membershipId, e.target.value);
            if (!result.ok) setError(result.error);
          })
        }
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="field-error max-w-[16rem]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RemoveMemberButton({ membershipId, name }: { membershipId: string; name: string }) {
  return (
    <ConfirmButton label="Remove" className="btn btn-sm btn-quiet text-danger" title={`Remove ${name}?`} confirmLabel="Remove member" danger action={() => removeMemberAction(membershipId)}>
      <p>{name} will immediately lose access to every client in this agency. Their past imports and reports stay. You can invite them again later.</p>
    </ConfirmButton>
  );
}

export function RevokeInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  return (
    <ConfirmButton label="Revoke" className="btn btn-sm" title="Revoke this invitation?" confirmLabel="Revoke invitation" danger action={() => revokeInvitationAction(invitationId)}>
      <p>The invite link sent to {email} will stop working. You can create a new invitation at any time.</p>
    </ConfirmButton>
  );
}

export function InviteForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('analyst');
  const [created, setCreated] = useState<{ url: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const email = String(new FormData(form).get('email') ?? '');
          startTransition(async () => {
            setError(null);
            setCopied(false);
            const result = await createInvitationAction({ email, role });
            if (!result.ok) return setError(result.error);
            setCreated({ url: `${window.location.origin}/invite/${result.data.token}`, email: result.data.email });
            form.reset();
          });
        }}
      >
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="invite-email">
            Email address
          </label>
          <input className="input" id="invite-email" name="email" type="email" required maxLength={200} autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="invite-role">
            Role
          </label>
          <select className="select w-32" id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-describedby="invite-role-hint">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Creating…' : 'Create invite link'}
        </button>
      </form>
      <p className="hint !mt-0" id="invite-role-hint">
        {ROLE_LABEL[role]}: {ROLE_DESCRIPTION[role]}
      </p>
      {error ? (
        <Notice tone="danger" live>
          {error}
        </Notice>
      ) : null}
      {created ? (
        <div className="rounded-[6px] border border-brand-line bg-brand-soft p-3" role="status">
          <label className="label !text-brand-strong" htmlFor="invite-link">
            Invite link for {created.email}, shown only once
          </label>
          <div className="flex gap-2">
            <input id="invite-link" className="input num text-[0.8rem]" readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(created.url);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="hint">CampaignLens does not send email. Send this link yourself; it works for 7 days and only for an account with this email address.</p>
        </div>
      ) : null}
    </div>
  );
}

export function InvitationExpiry({ expiresAt }: { expiresAt: string }) {
  return <span className="num">{formatTimestamp(expiresAt)}</span>;
}
