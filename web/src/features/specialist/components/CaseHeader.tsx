import { Badge, Button } from '@/components/ui';
import type { CaseDetail } from '@/types';
import { TIER_BADGE_TONE, TIER_LONG_LABEL } from '../tiers';

export function CaseHeader({ detail }: { detail: CaseDetail }) {
  return (
    <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
          <span className="mono text-xs text-muted">{detail.reviewRef}</span>
          <Badge tone={TIER_BADGE_TONE[detail.tier]}>{TIER_LONG_LABEL[detail.tier]}</Badge>
          <Badge tone="indigo" className="font-semibold tracking-normal">
            RECORD ↔ ALLEGATION
          </Badge>
        </div>
        <h1 className="mb-1 text-[22px] font-semibold tracking-[-.01em]">{detail.title}</h1>
        <div className="text-[13px] text-muted">
          Case <span className="mono">{detail.caseRef}</span> · Worker <span className="mono">{detail.workerId}</span>
          {detail.employer && detail.employer !== '—' ? ` · ${detail.employer}` : ''} · Call ended {detail.endedAt}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm">Assign to…</Button>
        <Button size="sm" onClick={() => window.print()}>
          Print pack
        </Button>
      </div>
    </div>
  );
}
