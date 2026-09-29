import { Navigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { Spinner } from '@/components/ui';
import {
  selectReviewQueueItems,
  selectReviewQueueStatus,
} from '@/features/specialist/state/reviewQueueSlice';
import { useAppSelector } from '@/store/hooks';

/**
 * Index route for `/specialist`. The Review Queue in the surrounding layout
 * already owns the fetch; this component just navigates to its first case
 * once the queue has loaded so refreshing `/specialist` still lands somewhere
 * useful.
 */
export function SpecialistIndex() {
  const status = useAppSelector(selectReviewQueueStatus);
  const items = useAppSelector(selectReviewQueueItems);

  if (status === 'succeeded' && items.length > 0) {
    return <Navigate to={`${ROUTES.specialist}/${items[0].ref}`} replace />;
  }

  if (status === 'failed') {
    // The queue itself already renders an error state with retry; keep the
    // main pane visually calm rather than duplicating the alert.
    return (
      <main className="col-span-1 grid place-items-center px-6 py-16 text-center text-[13px] text-muted xl:col-span-2">
        Couldn't load the queue. Try again from the panel on the left.
      </main>
    );
  }

  if (status === 'succeeded') {
    return (
      <main className="col-span-1 grid place-items-center px-6 py-16 text-center xl:col-span-2">
        <div>
          <div className="text-[15px] font-semibold">No cases in the queue</div>
          <div className="mt-1 text-[13px] text-muted">Nothing is waiting for review right now.</div>
        </div>
      </main>
    );
  }

  return (
    <main
      role="status"
      className="col-span-1 grid place-items-center px-6 py-16 text-center xl:col-span-2"
    >
      <div className="flex flex-col items-center gap-2 text-muted">
        <Spinner />
        <span>Loading queue…</span>
      </div>
    </main>
  );
}
