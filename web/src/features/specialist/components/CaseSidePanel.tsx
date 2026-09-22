import { useState } from 'react';
import { TranscriptList } from '@/components/transcript/Transcript';
import { AUDIT, CASE_HISTORY, RULE_IN_FORCE, TRANSCRIPT } from '@/data/mock';
import { cn } from '@/lib/cn';
import { AuditTimeline } from './AuditLog';

type Tab = 'transcript' | 'audit' | 'rule';

const TABS: { key: Tab; label: string }[] = [
  { key: 'transcript', label: 'Transcript' },
  { key: 'audit', label: 'Audit log' },
  { key: 'rule', label: 'Rule text' },
];

function PanelLabel({ children }: { children: string }) {
  return <div className="text-[11px] uppercase tracking-[.05em] text-muted">{children}</div>;
}

export function CaseSidePanel() {
  const [tab, setTab] = useState<Tab>('transcript');

  return (
    <aside
      aria-label="Case evidence"
      className="flex min-h-0 flex-col border-t border-line bg-white xl:sticky xl:top-14 xl:h-[calc(100vh-56px)] xl:border-l xl:border-t-0"
    >
      <div role="tablist" className="flex gap-0.5 border-b border-line-soft px-4 py-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-[12.5px]',
              tab === t.key ? 'bg-ink font-semibold text-white' : 'font-medium text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 text-[13px] leading-normal">
        {tab === 'transcript' && (
          <>
            <PanelLabel>Post-call transcript · HMAC verified</PanelLabel>
            <TranscriptList entries={TRANSCRIPT} density="compact" />
            <div className="my-1 h-px bg-line-soft" />
            <PanelLabel>Case history</PanelLabel>
            <ol className="flex flex-col gap-2 text-[12.5px] text-ink">
              {CASE_HISTORY.map((h, i) => (
                <li key={`${h.time}-${i}`}>
                  <span className="mono text-subtle">{h.time}</span> · {h.event}
                </li>
              ))}
            </ol>
          </>
        )}

        {tab === 'audit' && (
          <>
            <PanelLabel>Agent activity · append-only</PanelLabel>
            <AuditTimeline entries={AUDIT} />
          </>
        )}

        {tab === 'rule' && (
          <>
            <PanelLabel>{`Rule in force · ${RULE_IN_FORCE.id}`}</PanelLabel>
            <p className="m-0">{RULE_IN_FORCE.summary}</p>
            <p className="m-0 text-muted">{RULE_IN_FORCE.effective}</p>
          </>
        )}
      </div>
    </aside>
  );
}
