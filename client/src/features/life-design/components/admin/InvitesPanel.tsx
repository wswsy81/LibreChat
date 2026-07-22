import { useState } from 'react';
import { Copy, Link2 } from 'lucide-react';
import { request } from 'librechat-data-provider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@librechat/client';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

type InviteStatus = 'pending' | 'registered' | 'activated' | 'expired' | 'revoked';
type InvitePerson = { id: string; name?: string; email?: string };
type InviteRow = {
  id: string;
  codeHint: string | null;
  code?: string | null;
  url?: string | null;
  createdAt: string;
  expiresAt: string | null;
  status: InviteStatus;
  inviter: InvitePerson | null;
  acceptedBy: InvitePerson | null;
  acceptedAt: string | null;
  conversationCount: number;
  lastActive: string | null;
  legacy?: boolean;
};
type CreateInviteResponse = { code: string; url: string };

const statusKeys: Record<InviteStatus, TranslationKeys> = {
  pending: 'com_life_admin_invite_pending',
  registered: 'com_life_admin_invite_registered',
  activated: 'com_life_admin_invite_activated',
  expired: 'com_life_admin_invite_expired',
  revoked: 'com_life_admin_invite_revoked',
};

const dateText = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';

const personText = (person: InvitePerson | null) => person?.name || person?.email || '—';

const statusClass = (status: InviteStatus) => {
  if (status === 'activated') {
    return 'border-life-moss/40 text-life-moss';
  }
  if (status === 'registered') {
    return 'border-life-brass/40 text-life-brass';
  }
  if (status === 'pending') {
    return 'border-life-ink/20 text-life-muted';
  }
  return 'border-life-cinnabar/30 text-life-cinnabar';
};

export default function InvitesPanel() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [latest, setLatest] = useState<CreateInviteResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const list = useQuery<{ invites: InviteRow[] }>(['lifeAdminInvites'], () =>
    request.get<{ invites: InviteRow[] }>('/api/life/admin/invites'),
  );
  const create = useMutation<CreateInviteResponse>(
    () => request.post('/api/life/admin/invites', {}),
    {
      onSuccess: (data) => {
        setLatest(data);
        setCopied(null);
        queryClient.invalidateQueries(['lifeAdminInvites']);
      },
    },
  );

  const copyValue = async (value: string, kind: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className="space-y-8">
      <div className="border border-life-rule bg-life-paper p-5">
        <h2 className="font-life-serif text-life-lead font-semibold text-life-ink">
          {localize('com_life_admin_invite_create_title')}
        </h2>
        <p className="mt-2 max-w-[34em] font-life-sans text-life-sm text-life-muted">
          {localize('com_life_admin_invite_create_help')}
        </p>
        <Button
          type="button"
          disabled={create.isLoading}
          onClick={() => create.mutate()}
          className="mt-5 rounded-[4px] bg-life-moss text-life-paper hover:bg-life-moss-deep"
        >
          <Link2 className="mr-2 h-4 w-4" />
          {localize(
            create.isLoading
              ? 'com_life_admin_invite_creating'
              : 'com_life_admin_invite_create_action',
          )}
        </Button>
        {create.isError && (
          <p role="alert" className="mt-3 font-life-sans text-life-sm text-life-cinnabar">
            {localize('com_life_admin_invite_create_failed')}
          </p>
        )}
        {latest && (
          <div className="mt-5 space-y-3 border-t border-life-rule pt-5">
            <div className="grid gap-2 sm:grid-cols-[6rem_1fr_auto] sm:items-center">
              <span className="font-life-mono text-life-meta text-life-muted">
                {localize('com_life_admin_invite_code')}
              </span>
              <code className="break-all font-life-mono text-life-sm font-semibold text-life-ink">
                {latest.code}
              </code>
              <Button
                type="button"
                variant="outline"
                onClick={() => copyValue(latest.code, 'code')}
                className="justify-self-start rounded-[4px] border-life-ink/20 sm:justify-self-auto"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {localize(
                  copied === 'code'
                    ? 'com_life_admin_invite_copied'
                    : 'com_life_admin_invite_copy_code',
                )}
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[6rem_1fr_auto] sm:items-center">
              <span className="font-life-mono text-life-meta text-life-muted">
                {localize('com_life_admin_invite_link')}
              </span>
              <code className="min-w-0 break-all font-life-mono text-life-meta text-life-ink">
                {latest.url}
              </code>
              <Button
                type="button"
                onClick={() => copyValue(latest.url, 'url')}
                className="justify-self-start rounded-[4px] bg-life-ink text-life-paper sm:justify-self-auto"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {localize(
                  copied === 'url'
                    ? 'com_life_admin_invite_copied'
                    : 'com_life_admin_invite_copy_link',
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="font-life-serif text-life-lead font-semibold text-life-ink">
          {localize('com_life_admin_invite_list_title')}
        </h2>
        {list.isLoading && (
          <p className="mt-3 font-life-sans text-life-sm text-life-muted">
            {localize('com_life_admin_invite_loading')}
          </p>
        )}
        {list.data?.invites.length === 0 && (
          <p className="mt-3 font-life-sans text-life-sm text-life-muted">
            {localize('com_life_admin_invite_empty')}
          </p>
        )}
        <ul className="mt-3 divide-y divide-life-rule border-y border-life-rule">
          {list.data?.invites.map((invite) => (
            <li key={invite.id} className="grid gap-4 py-5 lg:grid-cols-[10rem_1fr_auto]">
              <div>
                <p className="font-life-mono text-life-meta text-life-muted">
                  {invite.legacy
                    ? localize('com_life_admin_invite_legacy')
                    : localize('com_life_admin_invite_code_tail', { 0: invite.codeHint || '—' })}
                </p>
                <p className="mt-1 font-life-mono text-life-meta text-life-muted">
                  {dateText(invite.createdAt)}
                </p>
                {invite.code && (
                  <div className="mt-2 space-y-1.5">
                    <code className="block break-all font-life-mono text-life-meta font-semibold text-life-ink">
                      {invite.code}
                    </code>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyValue(invite.code as string, `row-code-${invite.id}`)}
                        className="rounded-[4px] border-life-ink/20"
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        {localize(
                          copied === `row-code-${invite.id}`
                            ? 'com_life_admin_invite_copied'
                            : 'com_life_admin_invite_copy_code',
                        )}
                      </Button>
                      {invite.url && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyValue(invite.url as string, `row-url-${invite.id}`)}
                          className="rounded-[4px] border-life-ink/20"
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          {localize(
                            copied === `row-url-${invite.id}`
                              ? 'com_life_admin_invite_copied'
                              : 'com_life_admin_invite_copy_link',
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="font-life-mono text-life-meta text-life-muted">
                    {localize('com_life_admin_invite_inviter')}
                  </dt>
                  <dd className="mt-1 font-life-sans text-life-sm text-life-ink">
                    {personText(invite.inviter)}
                  </dd>
                </div>
                <div>
                  <dt className="font-life-mono text-life-meta text-life-muted">
                    {localize('com_life_admin_invite_accepted_by')}
                  </dt>
                  <dd className="mt-1 font-life-sans text-life-sm text-life-ink">
                    {personText(invite.acceptedBy)}
                  </dd>
                </div>
                <div>
                  <dt className="font-life-mono text-life-meta text-life-muted">
                    {localize('com_life_admin_invite_registered_at')}
                  </dt>
                  <dd className="mt-1 font-life-mono text-life-meta text-life-ink">
                    {dateText(invite.acceptedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="font-life-mono text-life-meta text-life-muted">
                    {localize('com_life_admin_invite_activity')}
                  </dt>
                  <dd className="mt-1 font-life-sans text-life-sm text-life-ink">
                    {invite.conversationCount > 0
                      ? localize('com_life_admin_invite_activity_value', {
                          0: String(invite.conversationCount),
                          1: dateText(invite.lastActive),
                        })
                      : '—'}
                  </dd>
                </div>
              </dl>
              <span
                className={`h-fit w-fit border px-2 py-1 font-life-mono text-life-meta ${statusClass(invite.status)}`}
              >
                {localize(statusKeys[invite.status])}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
