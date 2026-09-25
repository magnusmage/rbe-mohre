import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Spinner } from '@/components/ui';
import {
  fetchReviewCase,
  selectCase,
  selectCaseError,
  selectCaseStatus,
  selectCurrentCaseRef,
} from './state/caseSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { AgentActivityCard } from './components/AuditLog';
import { CaseHeader } from './components/CaseHeader';
import { CaseSidePanel } from './components/CaseSidePanel';
import { ComplaintDraftCard } from './components/ComplaintDraftCard';
import { DecisionPanel } from './components/DecisionPanel';
import { AllegationsCard, VerifiedFactsCard } from './components/EvidenceCards';
import { TranscriptStatusBanner } from './components/TranscriptStatusBanner';

/** Full-height, centred stand-in used for the whole-page states below. */
function ScreenState({ children }: { children: React.ReactNode }) {
  return (
    <main className="col-span-1 grid place-items-center px-6 py-16 text-center xl:col-span-2">
      <div className="w-full max-w-[320px]">{children}</div>
    </main>
  );
}

export function CaseReviewScreen() {
  const { caseRef = '' } = useParams<{ caseRef: string }>();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectCaseStatus);
  const currentRef = useAppSelector(selectCurrentCaseRef);
  const error = useAppSelector(selectCaseError);
  const data = useAppSelector(selectCase);

  // Fetch on caseRef change; guard against StrictMode double-invoke by only
  // dispatching when the ref differs from what the slice is holding.
  useEffect(() => {
    if (caseRef && caseRef !== currentRef) {
      dispatch(fetchReviewCase(caseRef));
    }
  }, [caseRef, currentRef, dispatch]);

  if (!caseRef) {
    return (
      <ScreenState>
        <div className="text-[15px] font-semibold">No case selected</div>
        <div className="mt-1 text-[13px] text-muted">Pick a case from the queue to review it.</div>
      </ScreenState>
    );
  }

  const loading = status === 'loading' || (status !== 'succeeded' && status !== 'failed');
  const stale = data?.reviewRef !== caseRef;

  if (status === 'failed' && currentRef === caseRef) {
    if (error?.kind === 'not-found') {
      return (
        <ScreenState>
          <div className="mono mb-1 text-xs text-muted">{caseRef}</div>
          <div className="text-[15px] font-semibold">Case pack not available</div>
          <div className="mt-1 text-[13px] text-muted">
            {error.message} Pick a different case from the queue.
          </div>
        </ScreenState>
      );
    }
    return (
      <ScreenState>
        <Alert title="Couldn't load this case">{error?.message ?? 'Please try again.'}</Alert>
        <div className="mt-3">
          <Button size="sm" onClick={() => dispatch(fetchReviewCase(caseRef))}>
            Try again
          </Button>
        </div>
      </ScreenState>
    );
  }

  if (loading || stale || !data) {
    return (
      <ScreenState>
        <div className="flex flex-col items-center gap-2 text-muted">
          <Spinner />
          <span>Loading case pack…</span>
          <div className="mono text-[11px]">{caseRef}</div>
        </div>
      </ScreenState>
    );
  }

  const { detail, allegations, verifiedFindings, rule, draft, transcript, audit, caseHistory } = data;

  return (
    <>
      <main className="min-w-0 px-4 py-5 md:px-6">
        <CaseHeader detail={detail} />
        <TranscriptStatusBanner pending={detail.transcriptPending} storedAt={detail.transcriptStoredAt} />

        <div className="mb-4 grid gap-3.5 md:grid-cols-2">
          <VerifiedFactsCard findings={verifiedFindings} rule={rule} />
          <AllegationsCard allegations={allegations} />
        </div>

        <div className="mb-4">
          <ComplaintDraftCard draft={draft} confirmedAt={detail.draftConfirmedAt} />
        </div>
        <div className="mb-4">
          <AgentActivityCard entries={audit} />
        </div>

        {/* Keyed by case so a fresh decision form is shown per case. */}
        <DecisionPanel key={detail.reviewRef} locked={detail.transcriptPending} />
      </main>
      <CaseSidePanel
        key={detail.reviewRef}
        transcript={transcript}
        transcriptPending={detail.transcriptPending}
        audit={audit}
        caseHistory={caseHistory}
        rule={rule}
      />
    </>
  );
}
