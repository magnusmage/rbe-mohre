import { Button, Card, CardHeader } from '@/components/ui';

export type DraftStatus = 'pending' | 'confirmed' | 'deferred';

const statusText: Record<DraftStatus, string> = {
  pending: 'pending confirmation',
  confirmed: 'worker confirmed',
  deferred: 'not yet — awaiting worker',
};

interface DraftConfirmCardProps {
  status: DraftStatus;
  onConfirm: () => void;
  onDefer: () => void;
}

export function DraftConfirmCard({ status, onConfirm, onDefer }: DraftConfirmCardProps) {
  return (
    <Card tone="brand">
      <CardHeader
        tone="brand"
        title="Confirm complaint draft"
        titleClassName="text-brand-dark"
        aside={<span className="mono text-[11.5px] text-brand">{statusText[status]}</span>}
      />
      <div className="p-4">
        <div className="mb-2.5 text-[13px] text-muted">
          The assistant is waiting for your explicit "yes" before drafting. Nothing is filed until a specialist reviews
          it.
        </div>
        <div className="mb-3.5 rounded-lg border border-line bg-surface-alt px-3.5 py-3 text-[13.5px] leading-[1.6]">
          <div className="mb-1 font-semibold">Summary — LAB-1002 · July 2026</div>
          Verified: contract wage AED 4,200.00; WPS AED 3,500.00; employer deduction AED 700.00 ("damage"). Allegation:
          worker states damage was not their fault. Filed: <span className="mono">false</span>.
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="primary" onClick={onConfirm} disabled={status === 'confirmed'}>
            Yes, prepare the draft
          </Button>
          <Button variant="secondary" onClick={onDefer} disabled={status === 'confirmed'}>
            Not yet
          </Button>
        </div>
      </div>
    </Card>
  );
}
