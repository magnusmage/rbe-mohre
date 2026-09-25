import { useEffect, useState } from 'react';

/**
 * Elapsed whole seconds since `startedAt`, ticking once a second while `running`.
 *
 * Derived from timestamps rather than an incrementing counter, so the value stays
 * accurate if the tab is throttled or backgrounded. Only one interval exists per
 * mounted consumer, and it is cleared on unmount or as soon as the call stops.
 */
export function useCallTimer(startedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || startedAt === null) return;

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [running, startedAt]);

  if (startedAt === null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
