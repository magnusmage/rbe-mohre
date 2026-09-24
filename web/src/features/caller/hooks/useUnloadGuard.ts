import { useEffect } from 'react';
import { voiceAgent } from '@/services/voice/voiceAgent';

/**
 * While a call is active, asks the browser to confirm a refresh/close (native wording
 * only — custom text is ignored by browsers) and tears the session down if the page
 * does go away, so the microphone is never left open.
 */
export function useUnloadGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    // Fires on refresh, close and bfcache navigations — last chance to release resources.
    const handlePageHide = () => {
      void voiceAgent.end();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [active]);
}
