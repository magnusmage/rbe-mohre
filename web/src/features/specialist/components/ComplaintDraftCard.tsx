import { Badge, Card, CardHeader } from '@/components/ui';
import type { CaseDetail } from '@/types';

export function ComplaintDraftCard({ detail }: { detail: CaseDetail }) {
  return (
    <Card radius="md">
      <CardHeader
        size="sm"
        title="Complaint draft (worker-confirmed)"
        meta={<span className="mono text-[11px] text-muted">{detail.draftRef} · filed: false</span>}
        aside={
          <Badge tone="brand" className="px-2 font-normal tracking-normal">
            confirmed {detail.draftConfirmedAt}
          </Badge>
        }
      />
      <div className="px-4 py-3.5 text-[13.5px] leading-[1.6]">
        Verified: WPS shows AED 3,500.00 paid on 2026-08-01 for period 2026-07; contract total wage AED 4,200.00;
        employer deduction of AED 700.00 recorded as "damage". Allegation: worker states the damage was not their fault
        and the AED 700 was not received. Missing evidence: none. Filed: <span className="mono">false</span> — will only
        be submitted to the complaint service if the specialist decides <span className="mono">open_complaint</span>.
      </div>
    </Card>
  );
}
