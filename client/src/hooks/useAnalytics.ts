import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { track, identify, funnelStage } from '~/utils/track';

/**
 * 全局产品分析:绑定内部 userId(按用户串漏斗/留存)+ 退出信标。
 * 挂在认证区根组件(ProductShell),覆盖首页/对话/存档/报告/运营台。
 * 页面浏览由 Umami 脚本自动跟踪,这里只补自定义的用户绑定与退出点。
 */
export default function useAnalytics(userId?: string | null): void {
  const location = useLocation();
  const enteredAt = useRef(Date.now());
  const currentRoute = useRef(location.pathname);

  useEffect(() => {
    if (userId) {
      identify(String(userId));
    }
  }, [userId]);

  useEffect(() => {
    enteredAt.current = Date.now();
    currentRoute.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') {
        return;
      }
      track('page_exit', {
        stage: funnelStage(currentRoute.current),
        dwell_s: Math.round((Date.now() - enteredAt.current) / 1000),
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
}

export { useAnalytics };
