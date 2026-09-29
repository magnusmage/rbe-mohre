import { Badge, Card, CardHeader } from '@/components/ui';
import type { DraftDto } from '@/services/review/reviewApi';
import { SectionEmpty } from './CaseSectionStates';

interface ComplaintDraftCardProps {
  draft: DraftDto | null;
  /** Server-formatted local timestamp of the `draft_complaint` audit event. */
  confirmedAt?: string;
}

export function ComplaintDraftCard({ draft, confirmedAt }: ComplaintDraftCardProps) {
  if (!draft) {
    return (
      <Card radius="md">
        <CardHeader size="sm" title="Complaint draft" />
        <SectionEmpty>No complaint draft was prepared during this call.</SectionEmpty>
      </Card>
    );
  }

  const body = draft.body ?? {};
  const filed = Boolean(draft.filed);

  return (
    <Card radius="md">
      <CardHeader
        size="sm"
        title="Complaint draft (worker-confirmed)"
        meta={
          <span className="mono text-[11px] text-muted">
            {draft.draft_ref} · filed: {String(filed)}
          </span>
        }
        aside={
          draft.worker_confirmed ? (
            <Badge tone="brand" className="px-2 font-normal tracking-normal">
              confirmed{confirmedAt ? ` ${confirmedAt}` : ''}
            </Badge>
          ) : (
            <Badge tone="warning" className="px-2 font-normal tracking-normal">
              awaiting worker confirmation
            </Badge>
          )
        }
      />
      <div className="px-4 py-3.5 text-[13.5px] leading-[1.6]">
        {body.summary || 'No summary was captured for this draft.'} Filed:{' '}
        <span className="mono">{String(filed)}</span> — will only be submitted to the complaint service if the
        specialist decides <span className="mono">open_complaint</span>.
      </div>
    </Card>
  );
}
