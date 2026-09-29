import { useCallback, useRef, useState } from 'react';
import { Link, NavLink, useMatch } from 'react-router-dom';
import { ChevronDownIcon, LogOutIcon } from '@/components/icons';
import { SPECIALIST } from '@/data/mock';
import {
  reviewerSignedOut,
  selectIsReviewerSignedIn,
} from '@/features/specialist/state/specialistAuthSlice';
import { useDismiss } from '@/hooks/useDismiss';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/app/routes';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { LanguageMenu } from './LanguageMenu';

const NAV_ITEMS = [
  { to: ROUTES.caller, label: 'Caller' },
  { to: ROUTES.specialist, label: 'Specialist review' },
] as const;

export function TopBar() {
  const isSpecialist = useMatch(`${ROUTES.specialist}/*`) !== null;
  const isReviewerSignedIn = useAppSelector(selectIsReviewerSignedIn);
  const dispatch = useAppDispatch();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 whitespace-nowrap border-b border-line bg-white px-4 md:gap-6 md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link
          to={ROUTES.callerReady}
          aria-label="RBE home — start a call"
          className="flex items-center gap-2.5 rounded-md text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-brand text-[13px] font-bold tracking-[-.02em] text-white">
            RBE
          </div>
          <div className="hidden text-sm font-semibold lg:block">Resolve Before It Escalates</div>
        </Link>
        <div className="hidden rounded-full border border-line px-2 py-0.5 text-xs text-muted xl:block">
          MoHRE · Labour Relations
        </div>
      </div>

      <nav aria-label="Primary" className="flex h-14 min-w-0 items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                '-mb-px flex h-14 items-center border-b-2 px-2.5 text-[13.5px] sm:px-3.5',
                isActive
                  ? 'border-brand font-semibold text-ink'
                  : 'border-transparent font-medium text-muted hover:text-ink',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      <LanguageMenu />

      {/* <div className="hidden border-l border-line pl-3 text-[13px] text-muted md:block">
        80084 · <span className="mono">v6.0</span>
      </div> */}

      {isSpecialist && (
        <div className="flex h-8 items-center border-l border-line pl-4">
          <SpecialistMenu
            signedIn={isReviewerSignedIn}
            onSignOut={() => dispatch(reviewerSignedOut())}
          />
        </div>
      )}
    </header>
  );
}

interface SpecialistMenuProps {
  signedIn: boolean;
  onSignOut: () => void;
}

/**
 * Reviewer identity chip in the top bar. Acts as an inert label until the
 * reviewer is signed in; once signed in, becomes a menu trigger whose only
 * item today is Sign out. Follows the LanguageMenu pattern (aria-haspopup,
 * outside-click / Escape via useDismiss) so keyboard and screen-reader
 * behaviour stay consistent across the bar.
 */
function SpecialistMenu({ signedIn, onSignOut }: SpecialistMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  // When there's no session there's nothing to do inside the menu, so render
  // the identity as static content rather than a control that opens an empty popup.
  if (!signedIn) {
    return (
      <div className="flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-full bg-indigo text-xs font-semibold text-white">
          {SPECIALIST.initials}
        </div>
        <div className="hidden text-[13px] md:block">
          <div className="font-semibold leading-[1.1]">{SPECIALIST.name}</div>
          <div className="text-[11.5px] text-muted">{SPECIALIST.role}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Reviewer menu — ${SPECIALIST.name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md pl-1 pr-1.5 py-1 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <div className="grid size-7 place-items-center rounded-full bg-indigo text-xs font-semibold text-white">
          {SPECIALIST.initials}
        </div>
        <div className="hidden text-left text-[13px] md:block">
          <div className="font-semibold leading-[1.1]">{SPECIALIST.name}</div>
          <div className="text-[11.5px] text-muted">{SPECIALIST.role}</div>
        </div>
        <ChevronDownIcon
          size={12}
          className={cn('text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Reviewer menu"
          className="absolute right-0 top-[42px] z-30 min-w-[200px] rounded-[10px] border border-line bg-white p-1 shadow-[0_8px_24px_-6px_rgba(20,32,43,.18)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onSignOut();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13.5px] font-medium text-ink hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <LogOutIcon size={14} className="text-muted" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
