import type { ReactNode } from 'react';
import { Badge, Card, CardHeader } from '@/components/ui';
import { cn } from '@/lib/cn';

interface FindingProps {
  kind: 'record' | 'allegation';
  label: string;
  source: string;
  children: ReactNode;
  footnote?: string;
}

function Finding({ kind, label, source, children, footnote }: FindingProps) {
  const isRecord = kind === 'record';
  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3.5',
        isRecord ? 'border-brand-100 bg-brand-25' : 'border-warn-line bg-warn-25',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <Badge tone={isRecord ? 'success' : 'warning'} className={isRecord ? '' : 'bg-warn-100!'}>
          {label}
        </Badge>
        <span className={cn('mono text-[11px]', isRecord ? 'text-brand' : 'text-warn-ink')}>{source}</span>
      </div>
      <div className={cn('text-sm leading-normal', !isRecord && 'italic text-warn-text')}>{children}</div>
      {footnote && <div className="mt-1.5 text-xs text-warn-ink">{footnote}</div>}
    </div>
  );
}

export function FindingsCard() {
  return (
    <Card>
      <CardHeader
        title="Findings this call"
        aside={
          <Badge tone="danger" className="font-semibold tracking-[.03em]">
            TIER RAISED · T0 → T2
          </Badge>
        }
      />
      <div className="flex flex-col gap-3 p-4">
        <Finding kind="record" label="VERIFIED · RECORD" source="check_wage · 2026-07">
          WPS shows <span className="mono font-semibold">AED 3,500.00</span> paid on{' '}
          <span className="mono">2026-08-01</span>. Employer recorded a deduction of{' '}
          <span className="mono font-semibold">AED 700.00</span> — reason on file: <em>"damage"</em>.
        </Finding>
        <Finding
          kind="allegation"
          label="ALLEGATION · UNVERIFIED"
          source="record_allegation"
          footnote="Kept separate from the record. The assistant will not say who is right."
        >
          "The damage was not my fault. I did not receive AED 700."
        </Finding>
      </div>
    </Card>
  );
}
