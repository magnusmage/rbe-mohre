import { useParams } from 'react-router-dom';
import { AUDIT, CASES } from '@/data/mock';
import { AgentActivityCard } from './components/AuditLog';
import { CaseHeader } from './components/CaseHeader';
import { CaseSidePanel } from './components/CaseSidePanel';
import { ComplaintDraftCard } from './components/ComplaintDraftCard';
import { DecisionPanel } from './components/DecisionPanel';
import { AllegationsCard, VerifiedFactsCard } from './components/EvidenceCards';
import { TranscriptStatusBanner } from './components/TranscriptStatusBanner';

export function CaseReviewScreen() {
  const { caseRef = '' } = useParams<{ caseRef: string }>();
  const detail = CASES[caseRef];

  if (!detail) {
    return (
      <main className="col-span-1 grid place-items-center px-6 py-16 text-center xl:col-span-2">
        <div>
          <div className="mono mb-1 text-xs text-muted">{caseRef}</div>
          <div className="text-[15px] font-semibold">Case pack not available</div>
          <div className="mt-1 text-[13px] text-muted">This case has no review pack loaded yet.</div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-w-0 px-4 py-5 md:px-6">
        <CaseHeader detail={detail} />
        <TranscriptStatusBanner pending={detail.transcriptPending} storedAt={detail.transcriptStoredAt} />

        <div className="mb-4 grid gap-3.5 md:grid-cols-2">
          <VerifiedFactsCard />
          <AllegationsCard />
        </div>

        <div className="mb-4">
          <ComplaintDraftCard detail={detail} />
        </div>
        <div className="mb-4">
          <AgentActivityCard entries={AUDIT} />
        </div>

        {/* Keyed by case so a fresh decision form is shown per case. */}
        <DecisionPanel key={detail.reviewRef} locked={detail.transcriptPending} />
      </main>
      <CaseSidePanel key={detail.reviewRef} />
    </>
  );
}
