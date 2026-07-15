import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import InvitesPanel from '../components/admin/InvitesPanel';
import StatusPanel from '../components/admin/StatusPanel';
import UsersPanel from '../components/admin/UsersPanel';
import CopyPanel from '../components/admin/CopyPanel';

/**
 * 运营台(仅 ADMIN 可见)。单人运营的内部工具,文案直接写中文,
 * 刻意不走 useLocalize——它本身就是管理文案的地方。
 * 刻意没有的功能:查看用户对话/存档(「你的存档只属于你」)。
 */
const TABS = [
  { key: 'invites', label: '邀请' },
  { key: 'users', label: '用户' },
  { key: 'copy', label: '文案' },
  { key: 'status', label: '状态' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function AdminRoute() {
  const { user, isAuthenticated } = useAuthContext();
  const [tab, setTab] = useState<TabKey>('invites');

  if (isAuthenticated && user && user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  if (!user) {
    return null;
  }

  return (
    <main
      className="mx-auto h-full w-full max-w-4xl overflow-y-auto px-4 py-8 sm:px-6"
      aria-labelledby="admin-title"
    >
      <p className="mb-2 text-life-meta font-medium tracking-[0.18em] text-life-cinnabar">
        OPERATIONS
      </p>
      <h1 id="admin-title" className="text-life-title font-semibold tracking-tight text-text-primary">
        运营台
      </h1>
      <p className="mt-2 text-life-sm text-text-secondary">
        邀请、用户、文案、状态。这里看不到任何人的对话与存档——存档只属于用户自己。
      </p>

      <div role="tablist" className="mt-6 flex gap-1 border-b border-border-light">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={
              tab === item.key
                ? 'border-b-2 border-life-cinnabar px-4 py-2 text-life-sm font-medium text-life-cinnabar'
                : 'px-4 py-2 text-life-sm text-text-secondary hover:text-text-primary'
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="py-6">
        {tab === 'invites' && <InvitesPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'copy' && <CopyPanel />}
        {tab === 'status' && <StatusPanel />}
      </div>
    </main>
  );
}
