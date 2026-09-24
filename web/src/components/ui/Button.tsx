import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'dark' | 'secondary' | 'muted' | 'danger' | 'glass';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white font-semibold hover:bg-brand-dark',
  dark: 'bg-ink text-white font-semibold hover:bg-black',
  secondary: 'bg-white text-ink border border-line font-medium hover:bg-surface-alt',
  muted: 'bg-surface-alt text-ink border border-line font-medium hover:bg-line-soft',
  danger: 'bg-danger text-white border border-danger-dark font-semibold hover:bg-danger-dark',
  glass: 'bg-white/6 text-white border border-white/14 font-medium hover:bg-white/12',
};

const sizes: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-[13px] rounded-lg',
  md: 'px-5 py-[11px] text-sm rounded-[10px]',
  lg: 'px-4 py-3.5 text-[13.5px] rounded-xl',
  xl: 'px-10 py-4 text-base rounded-full shadow-[0_8px_24px_-8px_rgba(11,117,104,.55)]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Disables the button and marks it busy, without the dimmed disabled look. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-colors',
        loading ? 'cursor-progress' : 'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  );
}
