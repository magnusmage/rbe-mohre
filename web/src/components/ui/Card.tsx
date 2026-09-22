import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type CardTone = 'default' | 'success' | 'warning' | 'brand' | 'dark';

const toneBorder: Record<CardTone, string> = {
  default: 'border border-line',
  success: 'border border-brand-100',
  warning: 'border border-warn-line',
  brand: 'border-2 border-brand',
  dark: 'border-2 border-ink',
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  radius?: 'md' | 'lg';
}

export function Card({ tone = 'default', radius = 'lg', className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'overflow-hidden bg-white',
        radius === 'lg' ? 'rounded-xl' : 'rounded-[10px]',
        toneBorder[tone],
        className,
      )}
      {...rest}
    />
  );
}

const headerTone: Record<CardTone, string> = {
  default: 'border-b border-line-soft',
  success: 'bg-brand-25 border-b border-brand-100',
  warning: 'bg-warn-25 border-b border-warn-line',
  brand: 'bg-brand-50 border-b border-brand-100',
  dark: 'bg-ink text-white',
};

interface CardHeaderProps {
  title: ReactNode;
  icon?: ReactNode;
  /** Content rendered inline right after the title. */
  meta?: ReactNode;
  /** Content pushed to the right edge. */
  aside?: ReactNode;
  tone?: CardTone;
  size?: 'sm' | 'md';
  titleClassName?: string;
}

export function CardHeader({
  title,
  icon,
  meta,
  aside,
  tone = 'default',
  size = 'md',
  titleClassName,
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2',
        size === 'md' ? 'px-4 py-3' : 'px-3.5 py-2.5',
        headerTone[tone],
      )}
    >
      {icon}
      <div className={cn('font-semibold', size === 'md' ? 'text-sm' : 'text-[13px]', titleClassName)}>{title}</div>
      {meta}
      <div className="flex-1" />
      {aside}
    </div>
  );
}
