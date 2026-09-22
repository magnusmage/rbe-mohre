import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/** Small uppercase section heading. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('text-xs font-semibold uppercase tracking-[.05em] text-muted', className)}>{children}</div>
  );
}

interface OrbProps {
  size?: 'big' | 'med';
  state: 'idle' | 'live' | 'ended';
  children?: ReactNode;
  className?: string;
}

/** Animated voice "orb" used across call phases. */
export function Orb({ size = 'big', state, children, className }: OrbProps) {
  return (
    <div
      className={cn(
        'orb',
        size === 'big' ? 'size-[200px]' : 'size-[140px]',
        state === 'live' ? 'orb-live' : 'orb-idle',
        state === 'ended' && 'orb-ended',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn('inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}

const WAVE_BARS = 7;

export function Waveform({ paused = false }: { paused?: boolean }) {
  return (
    <div className={cn('wave', paused && 'wave-paused')} aria-hidden="true">
      {Array.from({ length: WAVE_BARS }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  mono?: boolean;
  containerClassName?: string;
}

export function TextField({ label, mono, containerClassName, className, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={containerClassName}>
      <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          'w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15',
          mono && 'font-mono',
          className,
        )}
        {...rest}
      />
    </div>
  );
}

interface LabeledValueProps {
  label: string;
  value: ReactNode;
  mono?: boolean;
  /** `caps`: small uppercase label (session strip). `plain`: sentence-case label (call summary). */
  variant?: 'caps' | 'plain';
}

export function LabeledValue({ label, value, mono, variant = 'caps' }: LabeledValueProps) {
  const valueSize = variant === 'caps' ? 'text-[13.5px]' : mono ? 'text-[15px]' : 'text-sm';
  return (
    <div className="min-w-0">
      <div
        className={cn(
          'mb-0.5 text-muted',
          variant === 'caps' ? 'text-[10.5px] uppercase tracking-[.05em]' : 'text-[11px]',
        )}
      >
        {label}
      </div>
      <div className={cn(valueSize, mono && 'mono font-medium')}>{value}</div>
    </div>
  );
}
