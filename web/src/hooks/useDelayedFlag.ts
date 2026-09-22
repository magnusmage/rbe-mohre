import { useEffect, useState } from 'react';

/**
 * Returns `true` only once `active` has stayed true for `delayMs`, and resets immediately
 * when it turns false. Prevents loading indicators from flashing for very fast operations.
 */
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [flag, setFlag] = useState(false);

  useEffect(() => {
    if (!active) {
      setFlag(false);
      return;
    }
    const timer = window.setTimeout(() => setFlag(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return active && flag;
}
