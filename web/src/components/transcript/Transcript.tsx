import type { ReactNode } from 'react';
import { ListIcon } from '@/components/icons';
import { Card, CardHeader } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Speaker, TranscriptEntry } from '@/types';

const speakerColor: Record<Speaker, string> = {
  Agent: 'text-brand',
  Worker: 'text-indigo',
};

interface TranscriptListProps {
  entries: TranscriptEntry[];
  /** Show the tool chip next to agent turns that invoked a tool. */
  showTools?: boolean;
  density?: 'comfortable' | 'compact';
}

export function TranscriptList({ entries, showTools = false, density = 'comfortable' }: TranscriptListProps) {
  const compact = density === 'compact';
  return (
    <ol className="flex flex-col gap-3.5">
      {entries.map((entry, i) => (
        <li key={`${entry.time}-${i}`}>
          <div className={cn('mb-0.5 flex items-baseline', compact ? 'gap-1.5' : 'gap-2')}>
            <div
              className={cn(
                'font-bold uppercase tracking-[.05em]',
                compact ? 'text-[10.5px]' : 'text-[11px]',
                speakerColor[entry.who],
              )}
            >
              {entry.who}
            </div>
            <div className="mono text-[10.5px] text-subtle">{entry.time}</div>
            {showTools && entry.tool && (
              <span className="mono rounded-[3px] bg-indigo-50 px-1.5 py-px text-[10.5px] text-indigo">{entry.tool}</span>
            )}
          </div>
          <div className="text-ink">{entry.text}</div>
        </li>
      ))}
    </ol>
  );
}

interface TranscriptPanelProps extends TranscriptListProps {
  title: string;
  aside?: ReactNode;
  className?: string;
}

/** Card with header and a scrollable transcript body. */
export function TranscriptPanel({ title, aside, className, ...listProps }: TranscriptPanelProps) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader icon={<ListIcon size={14} color="#14202B" />} title={title} aside={aside} />
      <div className="overflow-y-auto px-4 py-3.5 text-[13.5px] leading-normal">
        <TranscriptList {...listProps} />
      </div>
    </Card>
  );
}
