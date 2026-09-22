import { Outlet } from 'react-router-dom';

export function CallerLayout() {
  return (
    <div data-screen-label="Caller" className="mx-auto max-w-[1200px] px-4 pb-10 pt-5 md:px-6">
      <Outlet />
    </div>
  );
}
