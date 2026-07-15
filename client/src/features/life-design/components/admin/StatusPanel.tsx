import { request } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';

type StatusData = {
  engine: { ok?: boolean; tools?: string[]; error?: string };
  mongo: boolean;
  users: number;
  uptimeSec: number;
};

const uptimeText = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days} 天 ${hours} 小时`;
  }
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分`;
  }
  return `${minutes} 分钟`;
};

function StatusCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded-2xl border border-border-light bg-surface-primary p-5">
      <p className="text-life-meta text-text-secondary">{label}</p>
      <p className={`mt-1 font-serif text-life-lead font-semibold ${ok ? 'text-life-moss' : 'text-red-600'}`}>
        {ok ? '正常' : '异常'}
      </p>
      <p className="mt-1 text-life-meta text-text-secondary">{detail}</p>
    </div>
  );
}

export default function StatusPanel() {
  const status = useQuery<StatusData>(
    ['lifeAdminStatus'],
    () => request.get('/api/life/admin/status'),
    { refetchInterval: 30000 },
  );

  if (status.isLoading) {
    return <p className="text-life-sm text-text-secondary">读取中…</p>;
  }
  if (!status.data) {
    return (
      <p role="alert" className="text-life-sm text-red-600">
        状态读取失败。
      </p>
    );
  }

  const { engine, mongo, users, uptimeSec } = status.data;
  const engineOk = engine?.ok === true;
  const toolCount = engine?.tools?.length ?? 0;

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <StatusCard
        label="人生引擎(排盘/报告/画像)"
        ok={engineOk}
        detail={engineOk ? `${toolCount} 个工具在线` : engine?.error || '连不上引擎'}
      />
      <StatusCard label="数据库" ok={mongo} detail={mongo ? '连接正常' : '连接断开'} />
      <div className="rounded-2xl border border-border-light bg-surface-primary p-5">
        <p className="text-life-meta text-text-secondary">注册用户</p>
        <p className="mt-1 font-mono text-life-lead font-semibold tabular-nums text-text-primary">
          {users}
        </p>
      </div>
      <div className="rounded-2xl border border-border-light bg-surface-primary p-5">
        <p className="text-life-meta text-text-secondary">服务已运行</p>
        <p className="mt-1 font-mono text-life-lead font-semibold tabular-nums text-text-primary">
          {uptimeText(uptimeSec)}
        </p>
      </div>
      <p className="text-life-meta text-text-secondary sm:col-span-2">
        每 30 秒自动刷新。备份每日 4:00 自动跑(服务器 ~/backups,保留 14 天)。
      </p>
    </section>
  );
}
