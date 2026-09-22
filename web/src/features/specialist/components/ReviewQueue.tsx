import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { LockIcon, SearchIcon } from '@/components/icons';
import { Badge } from '@/components/ui';
import { QUEUE, QUEUE_TOTALS } from '@/data/mock';
import { cn } from '@/lib/cn';
import type { Tier } from '@/types';
import { TIER_BADGE_TONE } from '../tiers';

type TierFilter = 'all' | Tier;

const FILTERS: { key: TierFilter; label: string; idle: string }[] = [
  { key: 'all', label: 'All', idle: 'bg-surface-alt text-muted' },
  { key: 'T2', label: `T2 · ${QUEUE_TOTALS.T2}`, idle: 'bg-danger-50 text-danger' },
  { key: 'T1', label: `T1 · ${QUEUE_TOTALS.T1}`, idle: 'bg-warn-50 text-warn-ink' },
  { key: 'T0', label: `T0 · ${QUEUE_TOTALS.T0}`, idle: 'bg-surface-alt text-muted' },
];

export function ReviewQueue() {
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<TierFilter>('all');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return QUEUE.filter(
      (item) =>
        (tier === 'all' || item.tier === tier) &&
        (!q || [item.ref, item.title, item.worker].some((field) => field.toLowerCase().includes(q))),
    );
  }, [query, tier]);

  return (
    <aside
      aria-label="Review queue"
      className="flex max-h-[420px] min-h-0 flex-col border-b border-line bg-white xl:sticky xl:top-14 xl:h-[calc(100vh-56px)] xl:max-h-none xl:border-b-0 xl:border-r"
    >
      <div className="border-b border-line-soft px-4 py-3.5">
        <div className="mb-2.5 flex items-baseline gap-2">
          <div className="text-[15px] font-semibold">Review queue</div>
          <div className="text-xs text-muted">{QUEUE_TOTALS.all} open</div>
        </div>
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search case ref, worker…"
            aria-label="Search queue"
            className="w-full rounded-md border border-line bg-surface-alt py-[7px] pl-[30px] pr-2.5 text-[13px] outline-none focus:border-brand focus:bg-white"
          />
          <SearchIcon size={14} color="#8A97A2" className="absolute left-[9px] top-2" />
        </div>
        <div className="mt-2.5 flex gap-1 text-[11.5px]" role="group" aria-label="Filter by tier">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={tier === f.key}
              onClick={() => setTier(f.key)}
              className={cn('rounded-full px-2.5 py-1 font-semibold', tier === f.key ? 'bg-ink text-white' : f.idle)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items.map((item) => (
          <li key={item.ref}>
            <NavLink
              to={`${ROUTES.specialist}/${item.ref}`}
              className={({ isActive }) =>
                cn(
                  'block border-b border-l-[3px] border-b-line-soft px-4 py-3 hover:bg-surface-alt',
                  isActive ? 'border-l-brand bg-[#F7FBFB]' : 'border-l-transparent bg-white',
                )
              }
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="mono text-[12.5px] font-semibold">{item.ref}</span>
                <Badge tone={TIER_BADGE_TONE[item.tier]} size="xs">
                  {item.tier}
                </Badge>
                <div className="flex-1" />
                {item.locked && <LockIcon size={12} color="#8A4C0A" aria-label="Decision locked" />}
              </div>
              <div className="mb-0.5 text-[13px] font-medium">{item.title}</div>
              <div className="text-[11.5px] text-muted">
                {item.worker} · {item.ago}
              </div>
            </NavLink>
          </li>
        ))}
        {items.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-muted">No cases match.</li>}
      </ul>
    </aside>
  );
}
