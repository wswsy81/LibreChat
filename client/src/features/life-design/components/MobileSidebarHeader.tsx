import { useLocation } from 'react-router-dom';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';

export default function MobileSidebarHeader() {
  const location = useLocation();
  const isChatRoute = location.pathname === '/c' || location.pathname.startsWith('/c/');

  if (isChatRoute) {
    return null;
  }

  return (
    <header className="flex h-14 shrink-0 items-center border-b border-life-rule bg-life-paper px-4 md:hidden">
      <OpenSidebar showLabel />
    </header>
  );
}
