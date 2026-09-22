import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'danger' | 'warning' | 'neutral' | 'success' | 'brand' | 'indigo';

const tones: Record<BadgeTone, string> = {
  danger: 'text-danger bg-danger-50',
  warning: 'text-warn-ink bg-warn-50',
  neutral: 'text-muted bg-line-soft',
  success: 'text-success bg-brand-50',
  brand: 'text-brand bg-brand-50',
  indigo: 'text-indigo bg-indigo-50',
};

const sizes = {
  xs: 'text-[10.5px] px-1.5 py-0.5 rounded-[3px] font-bold tracking-[.04em]',
  sm: 'text-[11px] px-2 py-0.5 rounded font-bold tracking-[.04em]',
  md: 'text-[12.5px] px-2.5 py-[3px] rounded font-bold',
};

interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  size?: keyof typeof sizes;
  mono?: boolean;
  className?: string;
}

export function Badge({ tone, children, size = 'sm', mono, className }: BadgeProps) {
  return (
    <span className={cn('inline-block whitespace-nowrap', sizes[size], tones[tone], mono && 'mono', className)}>
      {children}
    </span>
  );
}
