import { Outlet } from 'react-router-dom';
import { ReviewQueue } from './components/ReviewQueue';

export function SpecialistLayout() {
  return (
    <div
      data-screen-label="Specialist"
      className="grid min-h-[calc(100vh-56px)] grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_320px]"
    >
      <ReviewQueue />
      <Outlet />
    </div>
  );
}
