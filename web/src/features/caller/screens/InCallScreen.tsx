import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { TranscriptPanel } from '@/components/transcript/Transcript';
import { TRANSCRIPT } from '@/data/mock';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { BackButton } from '../components/BackButton';
import { CallHero } from '../components/CallHero';
import { DraftConfirmCard, type DraftStatus } from '../components/DraftConfirmCard';
import { FindingsCard } from '../components/FindingsCard';
import { RightsCard } from '../components/RightsCard';
import { SessionStrip } from '../components/SessionStrip';
import { TwoColumnLayout } from '../components/TwoColumnLayout';
import {
  endCall,
  selectAgentMode,
  selectCallStatus,
  selectMuted,
  setMicrophoneMuted,
} from '../state/callSessionSlice';

export function InCallScreen() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectCallStatus);
  const agentMode = useAppSelector(selectAgentMode);
  const muted = useAppSelector(selectMuted);
  const [ending, setEnding] = useState(false);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('pending');

  const isLive = status === 'connected';

  // React to the session closing from the other side (agent hang-up or dropped connection).
  const previousStatus = useRef(status);
  useEffect(() => {
    const wasLive = previousStatus.current === 'connected';
    previousStatus.current = status;
    if (!wasLive) return;
    if (status === 'ended') navigate(ROUTES.callerEnded);
    else if (status === 'failed') navigate(ROUTES.callerReady);
  }, [status, navigate]);

  const handleEndCall = async () => {
    if (!isLive) {
      navigate(ROUTES.callerEnded);
      return;
    }
    setEnding(true);
    // The status change to 'ended' triggers navigation via the effect above.
    await dispatch(endCall());
  };

  return (
    <>
      <BackButton to={ROUTES.callerReady} />
      <TwoColumnLayout
        main={
          <>
            <CallHero
              muted={muted}
              agentMode={isLive ? agentMode : null}
              busy={ending}
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
    </>
  );
}
