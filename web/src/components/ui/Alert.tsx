import type { ReactNode } from 'react';
import { AlertTriangleIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

type AlertTone = 'error' | 'warning';

const tones: Record<AlertTone, { box: string; icon: string; title: string; body: string }> = {
  error: {
    box: 'border-danger/30 border-l-danger bg-danger-50',
    icon: '#B42318',
    title: 'text-danger-dark',
    body: 'text-ink',
  },
  warning: {
    box: 'border-warn-line border-l-warn bg-warn-50',
    icon: '#A8650E',
    title: 'text-warn-deep',
    body: 'text-warn-deep',
  },
};

interface AlertProps {
  title: string;
  children: ReactNode;
  tone?: AlertTone;
  onDismiss?: () => void;
  className?: string;
}

/** Inline, announced message with an optional dismiss action. */
export function Alert({ title, children, tone = 'error', onDismiss, className }: AlertProps) {
  const t = tones[tone];
  return (
    <div
      role="alert"
      className={cn('flex items-start gap-2.5 rounded-lg border border-l-4 px-4 py-3 text-left', t.box, className)}
    >
      <AlertTriangleIcon size={18} color={t.icon} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        <div className={cn('text-[13.5px] font-semibold', t.title)}>{title}</div>
        <div className={cn('mt-0.5 text-[13px] leading-normal', t.body)}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 shrink-0 rounded px-1.5 text-lg leading-none text-muted hover:text-ink"
        >
          ×
        </button>
      )}
    </div>
  );
}
