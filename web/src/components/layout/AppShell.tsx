import { Outlet } from 'react-router-dom';
import { useUnloadGuard } from '@/features/caller/hooks/useUnloadGuard';
import { selectIsCallActive } from '@/features/caller/state/callSessionSlice';
import { useAppSelector } from '@/store/hooks';
import { TopBar } from './TopBar';

export function AppShell() {
  // Warns before refresh/close and releases the session if the page goes away.
  useUnloadGuard(useAppSelector(selectIsCallActive));

  return (
    <div className="min-h-screen bg-canvas">
      <TopBar />
      <Outlet />
    </div>
  );
}
