import type { ReactNode } from 'react';
import { AlertTriangleIcon, CheckIcon } from '@/components/icons';
import { Card, CardHeader } from '@/components/ui';
import type { AllegationDto, VerifiedFindingDto } from '@/services/review/reviewApi';
import { SectionEmpty } from './CaseSectionStates';

function FactLabel({ children }: { children: ReactNode }) {
  return <div className="mb-[3px] text-xs font-semibold text-muted">{children}</div>;
}

function Source({ children }: { children: ReactNode }) {
  return <div className="text-[11.5px] text-subtle">{children}</div>;
}

const Divider = () => <div className="h-px bg-line-soft" />;

function pluralise(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

interface VerifiedFactsCardProps {
  findings: VerifiedFindingDto[];
  rule?: { id: string; summary: string | null } | null;
}

export function VerifiedFactsCard({ findings, rule }: VerifiedFactsCardProps) {
  const count = findings.length;
  return (
    <Card tone="success" radius="md">
      <CardHeader
        tone="success"
        size="sm"
        icon={<CheckIcon size={14} color="#067647" />}
        title="Verified facts (records)"
        titleClassName="text-brand-dark"
        aside={<span className="text-[11px] text-brand">{pluralise(count, 'finding')}</span>}
      />
      {count === 0 && !rule ? (
        <SectionEmpty>No verified records were attached to this case pack.</SectionEmpty>
      ) : (
        <div className="flex flex-col gap-3 p-3.5">
          {findings.map((finding, i) => (
            <div key={`${finding.rule_id ?? 'rule'}-${i}`}>
              <FactLabel>
                {finding.code ?? 'FINDING'}
                {finding.period ? ` · ${finding.period}` : ''}
              </FactLabel>
              <div className="mono text-[15px] font-medium">{finding.detail ?? '—'}</div>
              {finding.amount && (
                <div className="mono mt-0.5 text-[13px] text-danger">Amount AED {finding.amount}</div>
              )}
              {finding.source && <Source>Source: {finding.source}</Source>}
              {i < findings.length - 1 && <div className="pt-3"><Divider /></div>}
            </div>
          ))}
          {rule && (
            <>
              {count > 0 && <Divider />}
              <div>
                <FactLabel>Rule in force · {rule.id}</FactLabel>
                {rule.summary ? (
                  <div className="text-[13px]">{rule.summary}</div>
                ) : (
                  <div className="text-[13px] text-muted">Rule summary not available in this case pack.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

interface AllegationsCardProps {
  allegations: AllegationDto[];
}

export function AllegationsCard({ allegations }: AllegationsCardProps) {
  const count = allegations.length;
  return (
    <Card tone="warning" radius="md">
      <CardHeader
        tone="warning"
        size="sm"
        icon={<AlertTriangleIcon size={14} color="#8A4C0A" />}
        title="Allegations (caller, unverified)"
        titleClassName="text-warn-deep"
        aside={<span className="text-[11px] text-warn-ink">{pluralise(count, 'statement')}</span>}
      />
      {count === 0 ? (
        <SectionEmpty>The caller made no allegations on this case.</SectionEmpty>
      ) : (
        <div className="flex flex-col gap-3 p-3.5">
          {allegations.map((allegation, i) => (
            <div key={`${allegation.at}-${i}`}>
              <FactLabel>
                Caller statement · CALLER-STATEMENT
                {allegation.period ? ` · ${allegation.period}` : ''}
              </FactLabel>
              <div className="text-sm italic leading-normal text-warn-text">"{allegation.statement}"</div>
              <div className="mt-1 text-[11.5px] text-subtle">
                Recorded via record_allegation · not verified against any record
              </div>
            </div>
          ))}
          <div className="rounded-md border border-dashed border-warn-line bg-warn-50 p-2.5 text-[12.5px] leading-normal text-warn-deep">
            <strong>Kept separate by design.</strong> The AI did not judge who is right. Records and allegations never
            merge (invariant 3).
          </div>
        </div>
      )}
    </Card>
  );
}
