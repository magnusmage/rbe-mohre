import type { ReactNode } from 'react';
import { AlertTriangleIcon, CheckIcon } from '@/components/icons';
import { Card, CardHeader } from '@/components/ui';
import { RULE_IN_FORCE } from '@/data/mock';

function FactLabel({ children }: { children: ReactNode }) {
  return <div className="mb-[3px] text-xs font-semibold text-muted">{children}</div>;
}

function Source({ children }: { children: ReactNode }) {
  return <div className="text-[11.5px] text-subtle">{children}</div>;
}

const Divider = () => <div className="h-px bg-line-soft" />;

export function VerifiedFactsCard() {
  return (
    <Card tone="success" radius="md">
      <CardHeader
        tone="success"
        size="sm"
        icon={<CheckIcon size={14} color="#067647" />}
        title="Verified facts (records)"
        titleClassName="text-brand-dark"
        aside={<span className="text-[11px] text-brand">2 findings</span>}
      />
      <div className="flex flex-col gap-3 p-3.5">
        <div>
          <FactLabel>Contract wage · CONTRACT</FactLabel>
          <div className="mono text-[15px] font-medium">AED 4,200.00 / month</div>
          <Source>Source: Employment contract (Zone 4)</Source>
        </div>
        <Divider />
        <div>
          <FactLabel>WPS · 2026-07 · WPS-RECORD</FactLabel>
          <div className="mono text-[15px] font-medium">Paid AED 3,500.00 · 2026-08-01</div>
          <div className="mono mt-0.5 text-[13px] text-danger">Deduction AED 700.00</div>
          <Source>Recorded reason on file: "damage" · Source: WPS record (Zone 4)</Source>
        </div>
        <Divider />
        <div>
          <FactLabel>Rule in force · {RULE_IN_FORCE.id}</FactLabel>
          <div className="text-[13px]">
            {RULE_IN_FORCE.summary} {RULE_IN_FORCE.effective}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function AllegationsCard() {
  return (
    <Card tone="warning" radius="md">
      <CardHeader
        tone="warning"
        size="sm"
        icon={<AlertTriangleIcon size={14} color="#8A4C0A" />}
        title="Allegations (caller, unverified)"
        titleClassName="text-warn-deep"
        aside={<span className="text-[11px] text-warn-ink">1 statement</span>}
      />
      <div className="flex flex-col gap-3 p-3.5">
        <div>
          <FactLabel>Caller statement · CALLER-STATEMENT · 2026-07</FactLabel>
          <div className="text-sm italic leading-normal text-warn-text">
            "The damage was not my fault. I did not receive AED 700."
          </div>
          <div className="mt-1 text-[11.5px] text-subtle">
            Recorded via record_allegation · not verified against any record
          </div>
        </div>
        <div className="rounded-md border border-dashed border-warn-line bg-warn-50 p-2.5 text-[12.5px] leading-normal text-warn-deep">
          <strong>Kept separate by design.</strong> The AI did not judge who is right. Records and allegations never
          merge (invariant 3).
        </div>
      </div>
    </Card>
  );
}
