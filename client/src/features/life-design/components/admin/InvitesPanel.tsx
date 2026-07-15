import { useState } from 'react';
import { Copy, Link2 } from 'lucide-react';
import { request } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@librechat/client';

type InviteRow = { createdAt: string; expiresAt: string | null; expired: boolean };

const dateText = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';

export default function InvitesPanel() {
  const queryClient = useQueryClient();
  const [latestUrl, setLatestUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const list = useQuery<{ invites: InviteRow[] }>(['lifeAdminInvites'], () =>
    request.get('/api/life/admin/invites'),
  );
  const create = useMutation<{ url: string }>(() => request.post('/api/life/admin/invites', {}), {
    onSuccess: (data) => {
      setLatestUrl(data.url);
      setCopied(false);
      queryClient.invalidateQueries(['lifeAdminInvites']);
    },
  });

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(latestUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-border-light bg-surface-primary p-5">
        <Button
          type="button"
          disabled={create.isLoading}
          onClick={() => create.mutate()}
          className="rounded-xl bg-life-moss text-life-paper hover:bg-life-moss-deep"
        >
          <Link2 className="mr-2 h-4 w-4" />
          {create.isLoading ? '生成中…' : '生成邀请链接'}
        </Button>
        <p className="mt-2 text-life-meta text-text-secondary">
          一人一链:7 天有效,注册一次即失效。链接只在生成时显示这一次,记得当场复制发出去。
        </p>
        {create.isError && (
          <p role="alert" className="mt-2 text-life-sm text-red-600">
            生成失败,稍后再试。
          </p>
        )}
        {latestUrl && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface-secondary p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-life-meta text-text-primary">
              {latestUrl}
            </code>
            <Button
              type="button"
              onClick={copyUrl}
              className="shrink-0 rounded-lg bg-life-ink text-life-paper"
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-serif text-life-lead font-semibold text-text-primary">
          已生成的邀请
        </h2>
        {list.isLoading && <p className="text-life-sm text-text-secondary">读取中…</p>}
        {list.data?.invites.length === 0 && (
          <p className="text-life-sm text-text-secondary">还没有生成过邀请。</p>
        )}
        <ul className="divide-y divide-border-light">
          {list.data?.invites.map((invite, index) => (
            <li key={index} className="flex items-center justify-between py-2.5 text-life-sm">
              <span className="text-text-primary">{dateText(invite.createdAt)} 生成</span>
              <span className={invite.expired ? 'text-text-secondary' : 'text-life-moss'}>
                {invite.expired ? '已过期/已用' : `${dateText(invite.expiresAt)} 前有效`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
