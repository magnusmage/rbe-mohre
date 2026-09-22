import { Link } from 'react-router-dom';
import { ChevronLeftIcon } from '@/components/icons';

interface BackButtonProps {
  to: string;
  label?: string;
}

/** Link back to the previous call phase. */
export function BackButton({ to, label = 'Back' }: BackButtonProps) {
  return (
    <Link
      to={to}
      className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-line bg-white py-1.5 pl-2 pr-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-alt"
    >
      <ChevronLeftIcon size={16} />
      {label}
    </Link>
  );
}
