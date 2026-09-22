import { Link, NavLink, useMatch } from 'react-router-dom';
import { SPECIALIST } from '@/data/mock';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/app/routes';
import { LanguageMenu } from './LanguageMenu';

const NAV_ITEMS = [
  { to: ROUTES.caller, label: 'Caller' },
  { to: ROUTES.specialist, label: 'Specialist review' },
] as const;

export function TopBar() {
  const isSpecialist = useMatch(`${ROUTES.specialist}/*`) !== null;

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
        <div className="flex h-8 items-center gap-2 border-l border-line pl-4">
          <div className="grid size-7 place-items-center rounded-full bg-indigo text-xs font-semibold text-white">
            {SPECIALIST.initials}
          </div>
          <div className="hidden text-[13px] md:block">
            <div className="font-semibold leading-[1.1]">{SPECIALIST.name}</div>
            <div className="text-[11.5px] text-muted">{SPECIALIST.role}</div>
          </div>
        </div>
      )}
    </header>
  );
}
