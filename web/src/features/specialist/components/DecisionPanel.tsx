import { useState } from 'react';
import { CheckCircleIcon } from '@/components/icons';
import { Button, Card, CardHeader } from '@/components/ui';
import { DECISION_OPTIONS, DEFAULT_DECISION_NOTE, SPECIALIST } from '@/data/mock';
import { cn } from '@/lib/cn';
import type { DecisionKey } from '@/types';

interface DecisionPanelProps {
  /** Decision stays locked until the verified transcript is stored. */
  locked: boolean;
}

export function DecisionPanel({ locked }: DecisionPanelProps) {
  const [selected, setSelected] = useState<DecisionKey | null>(null);
  const [note, setNote] = useState(DEFAULT_DECISION_NOTE);
  const [recorded, setRecorded] = useState<DecisionKey | null>(null);

  const option = DECISION_OPTIONS.find((o) => o.key === (recorded ?? selected));
  const disabled = locked || recorded !== null;

  return (
    <Card tone="dark" radius="md" className="mb-8">
      <CardHeader
        tone="dark"
        icon={<CheckCircleIcon size={16} color="#fff" />}
        title="Specialist decision"
        aside={<span className="text-[11.5px] text-[#9AA7B4]">Decided once · every tier reaches a human</span>}
      />
      <div className="p-4">
        <div
          role="radiogroup"
          aria-label="Decision"
          className={cn('mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4', locked && 'opacity-40')}
        >
          {DECISION_OPTIONS.map((opt) => {
            const active = (recorded ?? selected) === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => setSelected(opt.key)}
                style={active ? { borderColor: opt.color } : undefined}
                className={cn(
                  'rounded-lg px-3.5 py-3 text-left transition-colors disabled:cursor-default',
                  active ? 'border-2 bg-brand-25' : 'border border-line bg-white enabled:hover:bg-surface-alt',
                )}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="mono text-[10.5px] text-muted">{opt.index}</span>
                  <span className="text-[13px] font-semibold">{opt.title}</span>
                </div>
                <div className="text-[11.5px] leading-[1.4] text-muted">{opt.description}</div>
              </button>
            );
          })}
        </div>

        {option && recorded === null && (
          <div className="border-t border-line-soft pt-3.5">
            <label htmlFor="decision-note" className="mb-1.5 block text-[12.5px] text-muted">
              Note to record (audited, visible to the worker)
            </label>
            <textarea
              id="decision-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`Reason for ${option.label} — cite finding IDs and rule.`}
              className="min-h-[70px] w-full resize-y rounded-md border border-line px-3 py-2.5 text-[13px] outline-none focus:border-brand"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <div className="text-xs text-muted">
                Signed by <strong className="text-ink">{SPECIALIST.name}</strong> · specialist token · auth verified
              </div>
              <div className="flex-1" />
              <Button size="sm" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="border-0 px-[18px] font-semibold text-white hover:opacity-90"
                style={{ background: option.color }}
                disabled={note.trim().length === 0}
                onClick={() => setRecorded(option.key)}
              >
                Confirm: {option.label}
              </Button>
            </div>
          </div>
        )}

        {option && recorded !== null && (
          <div role="status" className="flex items-center gap-2 border-t border-line-soft pt-3.5 text-[13px]">
            <CheckCircleIcon size={16} color={option.color} />
            <span>
              Decision recorded: <strong>{option.label}</strong> · signed by {SPECIALIST.name}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
