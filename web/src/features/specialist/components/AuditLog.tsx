import { DocumentIcon } from '@/components/icons';
import { Badge, Card, CardHeader } from '@/components/ui';
import type { AuditEntry } from '@/types';
import { AUDIT_RESULT_TONE } from '../tiers';

function ResultBadge({ result }: { result: AuditEntry['result'] }) {
  return (
    <Badge tone={AUDIT_RESULT_TONE[result]} size="xs" mono className="text-[11px] font-medium tracking-normal">
      {result}
    </Badge>
  );
}

/** Full-width append-only agent activity table. */
export function AgentActivityCard({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card radius="md">
      <CardHeader
        size="sm"
        icon={<DocumentIcon size={14} color="#3346A8" />}
        title="Agent activity (append-only)"
        aside={<span className="mono text-[11px] text-muted">7 tool calls · 0 refusals</span>}
      />
      <ul>
        {entries.map((entry) => (
          <li
            key={`${entry.time}-${entry.tool}`}
            className="grid grid-cols-[72px_1fr_auto] items-baseline gap-2.5 border-b border-line-soft px-3.5 py-[9px] text-[12.5px] last:border-b-0 md:grid-cols-[88px_130px_1fr_90px]"
          >
            <div className="mono text-muted">{entry.time}</div>
            <div className="mono font-medium text-indigo">{entry.tool}</div>
            <div className="col-span-3 row-start-2 text-ink md:col-span-1 md:row-start-auto">{entry.detail}</div>
            <div className="col-start-3 row-start-1 text-right md:col-start-auto md:row-start-auto">
              <ResultBadge result={entry.result} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Compact stacked variant for the side panel. */
export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={`${entry.time}-${entry.tool}`}>
          <div className="mb-0.5 flex items-baseline gap-1.5">
            <span className="mono text-[10.5px] text-subtle">{entry.time}</span>
            <span className="mono text-[11.5px] font-medium text-indigo">{entry.tool}</span>
            <div className="flex-1" />
            <ResultBadge result={entry.result} />
          </div>
          <div className="text-[12.5px]">{entry.detail}</div>
        </li>
      ))}
    </ol>
  );
}
