/**
 * 人生设计室 · 产品分析埋点(发往自建 Umami)。
 *
 * 铁律:
 * - 只记「行为」不记「内容」——绝不传消息文本、报告内容、画像字段值、姓名邮箱、
 *   生辰具体值、领域状态具体值。属性只放类别/编号/桶/计数/时长。
 * - 埋点绝不能拖垮产品:umami 未加载或报错一律吞掉。
 * - distinct_id 由 Umami 会话处理;我们只在需要按用户串时用 identify(内部 userId)。
 */

type TrackProps = Record<string, string | number | boolean>;

type UmamiApi = {
  track: (event?: string, data?: TrackProps) => void;
  identify: (id: string, data?: TrackProps) => void;
};

function umami(): UmamiApi | undefined {
  return (window as unknown as { umami?: UmamiApi }).umami;
}

/** 记一个自定义事件。event 用 snake_case;props 只放非敏感类别/计数。 */
export function track(event: string, props?: TrackProps): void {
  try {
    umami()?.track(event, props);
  } catch {
    /* 分析失败绝不影响产品 */
  }
}

/** 把当前会话绑到内部 userId,用于按用户串漏斗/留存(不含任何内容)。 */
export function identify(userId: string): void {
  try {
    umami()?.identify(userId);
  } catch {
    /* 忽略 */
  }
}

/** 从路由推导所处漏斗阶段,给退出信标用(不含内容)。 */
export function funnelStage(pathname: string): string {
  if (pathname === '/home' || pathname === '/') {
    return 'onboarding';
  }
  if (pathname.startsWith('/c/')) {
    return 'conversation';
  }
  if (pathname.startsWith('/archive/reports/')) {
    return 'report';
  }
  if (pathname.startsWith('/archive')) {
    return 'archive';
  }
  if (pathname === '/resume') {
    return 'resume';
  }
  if (pathname === '/login' || pathname === '/register') {
    return 'auth';
  }
  return 'other';
}
