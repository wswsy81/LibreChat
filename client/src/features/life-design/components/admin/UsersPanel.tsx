/* eslint-disable i18next/no-literal-string */
import { request } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type UserRow = {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: string;
  createdAt: string;
  conversations: number;
  lastActive: string | null;
};

const dateText = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : '—';

export default function UsersPanel() {
  const queryClient = useQueryClient();
  const list = useQuery<{ users: UserRow[] }>(['lifeAdminUsers'], () =>
    request.get<{ users: UserRow[] }>('/api/life/admin/users'),
  );
  const remove = useMutation<{ deleted: boolean }, Error, string>(
    (id) => request.delete(`/api/life/admin/users/${encodeURIComponent(id)}`),
    { onSuccess: () => queryClient.invalidateQueries(['lifeAdminUsers']) },
  );

  const confirmRemove = (user: UserRow) => {
    const ok = window.confirm(
      `确定删除「${user.name}(${user.email})」?\n会一并删除其全部对话与消息,不可恢复。`,
    );
    if (ok) {
      remove.mutate(user.id);
    }
  };

  if (list.isLoading) {
    return <p className="text-life-sm text-text-secondary">读取中…</p>;
  }

  return (
    <section>
      <p className="mb-3 text-life-meta text-text-secondary">
        共 {list.data?.users.length ?? 0} 人。删除会连带对话与消息;存档画像在引擎里,需另行处理。
      </p>
      {remove.isError && (
        <p role="alert" className="mb-2 text-life-sm text-red-600">
          删除失败:{remove.error?.message || '稍后再试'}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-border-light">
        <table className="w-full text-left text-life-sm">
          <thead className="bg-surface-secondary text-life-meta text-text-secondary">
            <tr>
              <th className="px-4 py-2.5 font-medium">昵称</th>
              <th className="px-4 py-2.5 font-medium">邮箱</th>
              <th className="px-4 py-2.5 font-medium">注册</th>
              <th className="px-4 py-2.5 font-medium">对话</th>
              <th className="px-4 py-2.5 font-medium">最近活跃</th>
              <th className="px-4 py-2.5 font-medium" aria-label="操作" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {list.data?.users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-2.5 text-text-primary">
                  {user.name}
                  {user.role === 'ADMIN' && (
                    <span className="ml-1.5 rounded bg-life-cinnabar/10 px-1.5 py-0.5 text-life-meta text-life-cinnabar">
                      管理员
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">{user.email}</td>
                <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                  {dateText(user.createdAt)}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-text-primary">{user.conversations}</td>
                <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                  {dateText(user.lastActive)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {user.role !== 'ADMIN' && (
                    <button
                      type="button"
                      disabled={remove.isLoading}
                      onClick={() => confirmRemove(user)}
                      className="text-life-meta text-red-600 hover:underline disabled:opacity-50"
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
