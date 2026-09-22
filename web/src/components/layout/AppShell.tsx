import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';

export function AppShell() {
  return (
    <div className="min-h-screen bg-canvas">
      <TopBar />
      <Outlet />
    </div>
  );
}
