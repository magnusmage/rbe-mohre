import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  callErrorDismissed,
  selectCallError,
  selectCallStatus,
  selectIsStartingCall,
  startCall,
  type CallStatus,
} from '../state/callSessionSlice';

const PROGRESS_LABEL: Partial<Record<CallStatus, string>> = {
  'requesting-microphone': 'Checking microphone…',
  'fetching-session': 'Preparing secure session…',
  connecting: 'Connecting to assistant…',
};

/** Runs the Start Call flow and navigates to the call screen once the voice agent is connected. */
export function useStartCall() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const status = useAppSelector(selectCallStatus);
  const error = useAppSelector(selectCallError);
  const isStarting = useAppSelector(selectIsStartingCall);
  // Progress UI only appears for steps that take noticeable time (avoids flashes on instant failures).
  const showProgress = useDelayedFlag(isStarting);

  // Don't redirect if the user already left this screen while the call was connecting.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    const result = await dispatch(startCall());
    if (startCall.fulfilled.match(result) && mounted.current) {
      navigate(ROUTES.callerCall);
    }
  }, [dispatch, navigate]);

  const dismissError = useCallback(() => dispatch(callErrorDismissed()), [dispatch]);

  return {
    start,
    /** True for the whole start attempt; use it to block duplicate starts. */
    isStarting,
    /** True once the attempt has run long enough to show progress UI. */
    showProgress,
    progressLabel: showProgress ? (PROGRESS_LABEL[status] ?? null) : null,
    // Includes errors from an in-call drop, since the call screen redirects back here.
    error,
    dismissError,
  };
}
