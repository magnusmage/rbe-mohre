import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Small, opinionated stand-ins used inside case-pack cards so no section is
 * ever left blank. They intentionally share the padding of the surrounding
 * card body rather than owning their own chrome.
 */

interface Props {
  children: ReactNode;
  className?: string;
}

export function SectionEmpty({ children, className }: Props) {
  // No ARIA role: empty-state copy is decorative, not a live region.
  return <div className={cn('px-4 py-6 text-center text-[13px] text-muted', className)}>{children}</div>;
}

export function SectionLoading({ children = 'Loading…', className }: { children?: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 px-4 py-6 text-[13px] text-muted', className)}>
      <Spinner size={14} />
      <span>{children}</span>
    </div>
  );
}

export function SectionError({ children, className }: Props) {
  return (
    <div role="alert" className={cn('px-4 py-6 text-center text-[13px] text-danger-dark', className)}>
      {children}
    </div>
  );
}
