import { useEffect, useRef, useState } from 'react';
import { Navigate, useBlocker, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { TranscriptPanel } from '@/components/transcript/Transcript';
import { Alert, ConfirmDialog } from '@/components/ui';
import { TRANSCRIPT } from '@/data/mock';
import { formatDuration } from '@/lib/time';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { BackButton } from '../components/BackButton';
import { CallHero } from '../components/CallHero';
import { DraftConfirmCard, type DraftStatus } from '../components/DraftConfirmCard';
import { FindingsCard } from '../components/FindingsCard';
import { RightsCard } from '../components/RightsCard';
import { SessionStrip } from '../components/SessionStrip';
import { TwoColumnLayout } from '../components/TwoColumnLayout';
import { useCallTimer } from '../hooks/useCallTimer';
import {
  agentErrorDismissed,
  endCall,
  selectAgentError,
  selectAgentMode,
  selectCallStartedAt,
  selectCallStatus,
  selectIsCallActive,
  selectIsEndingCall,
  selectMuted,
  setMicrophoneMuted,
} from '../state/callSessionSlice';

export function InCallScreen() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectCallStatus);
  const isActive = useAppSelector(selectIsCallActive);
  const isEnding = useAppSelector(selectIsEndingCall);
  const agentMode = useAppSelector(selectAgentMode);
  const agentError = useAppSelector(selectAgentError);
  const muted = useAppSelector(selectMuted);
  const startedAt = useAppSelector(selectCallStartedAt);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('pending');

  const isLive = status === 'connected';
  // Ticks only while the call is live; the interval is cleared on end and on unmount.
  const elapsedSeconds = useCallTimer(startedAt, isLive);

  /** True once this screen has backed a real session, so the end/redirect effects may run. */
  const hadSession = useRef(isActive);
  useEffect(() => {
    if (isActive) hadSession.current = true;
  }, [isActive]);
  /** Set when the user confirmed leaving, so the end-of-call redirect stands aside. */
  const leaving = useRef(false);

  // Confirm before any navigation away from a live call (Back link, top bar, browser Back).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => isLive && currentLocation.pathname !== nextLocation.pathname,
  );
  const isBlocked = blocker.state === 'blocked';
  // Always act on the current blocker: `confirmLeave` awaits, by which time the
  // captured one may be stale, and proceeding twice would navigate twice.
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  /** Where the caller was heading when the confirmation appeared. */
  const leaveTarget = useRef<string | null>(null);
  useEffect(() => {
    if (blocker.state === 'blocked') leaveTarget.current = blocker.location.pathname;
  }, [blocker]);

  // Follow the session closing from the other side.
  const previousStatus = useRef(status);
  useEffect(() => {
    const wasActive = previousStatus.current === 'connected' || previousStatus.current === 'ending';
    previousStatus.current = status;
    if (!wasActive || leaving.current) return;
    if (status === 'ended') navigate(ROUTES.callerEnded, { replace: true });
    else if (status === 'failed') navigate(ROUTES.callerReady, { replace: true });
  }, [status, navigate]);

  // No session behind this screen (direct visit or page refresh) — start a new call instead.
  if (!isActive && !hadSession.current) {
    return <Navigate to={ROUTES.callerReady} replace />;
  }

  const handleEndCall = () => {
    if (isLive) void dispatch(endCall());
  };

  const confirmLeave = async () => {
    leaving.current = true;
    const target = leaveTarget.current ?? ROUTES.callerReady;
    await dispatch(endCall());

    // React Router resets the blocker by itself as soon as the call is no longer
    // live, so only proceed while it is still blocked; otherwise navigate directly.
    const current = blockerRef.current;
    if (current.state === 'blocked') current.proceed();
    else navigate(target, { replace: true });
  };

  const cancelLeave = () => {
    leaving.current = false;
    if (blockerRef.current.state === 'blocked') blockerRef.current.reset();
  };

  return (
    <>
      <BackButton to={ROUTES.callerReady} />
      <TwoColumnLayout
        main={
          <>
            {agentError && (
              <Alert tone="warning" title="Assistant reported a problem" onDismiss={() => dispatch(agentErrorDismissed())}>
                {agentError}
              </Alert>
            )}
            <CallHero
              muted={muted}
              agentMode={isLive ? agentMode : null}
              elapsedLabel={formatDuration(elapsedSeconds)}
              busy={isEnding}
              onToggleMute={() => dispatch(setMicrophoneMuted(!muted))}
              // Transferring hands the caller to a human specialist, which ends the assistant call.
              onTransfer={handleEndCall}
              onEndCall={handleEndCall}
            />
            <SessionStrip />
            <FindingsCard />
            <DraftConfirmCard
              status={draftStatus}
              onConfirm={() => setDraftStatus('confirmed')}
              onDefer={() => setDraftStatus('deferred')}
            />
          </>
        }
        rail={
          <>
            <TranscriptPanel
              title="Live transcript"
              aside={<span className="text-[11px] text-muted">Scribe v2 · EN</span>}
              entries={TRANSCRIPT}
              showTools
              className="max-h-[600px]"
            />
            <RightsCard />
          </>
        }
      />

      <ConfirmDialog
        open={isBlocked}
        title="Leave this call?"
        message="Are you sure you want to leave? The call will end."
        confirmLabel="Yes, end the call"
        cancelLabel="Cancel"
        destructive
        busy={isEnding}
        onConfirm={() => void confirmLeave()}
        onCancel={cancelLeave}
      />
    </>
  );
}
