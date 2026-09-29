import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { LockIcon, SearchIcon } from '@/components/icons';
import { Alert, Badge, Button, Spinner } from '@/components/ui';
import {
  fetchReviewQueue,
  selectReviewQueueError,
  selectReviewQueueItems,
  selectReviewQueueStatus,
  selectReviewQueueTotals,
} from '@/features/specialist/state/reviewQueueSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { cn } from '@/lib/cn';
import type { Tier } from '@/types';
import { TIER_BADGE_TONE } from '../tiers';

type TierFilter = 'all' | Tier;

const FILTER_META: Record<TierFilter, { label: string; idle: string }> = {
  all: { label: 'All', idle: 'bg-surface-alt text-muted' },
  T2: { label: 'T2', idle: 'bg-danger-50 text-danger' },
  T1: { label: 'T1', idle: 'bg-warn-50 text-warn-ink' },
  T0: { label: 'T0', idle: 'bg-surface-alt text-muted' },
};

/** Wraps the queue in the sticky aside; keeps chrome consistent across states. */
function QueueShell({ children, header }: { children: React.ReactNode; header: React.ReactNode }) {
  return (
    <aside
      aria-label="Review queue"
      className="flex max-h-[420px] min-h-0 flex-col border-b border-line bg-white xl:sticky xl:top-14 xl:h-[calc(100vh-56px)] xl:max-h-none xl:border-b-0 xl:border-r"
    >
      {header}
      {children}
    </aside>
  );
}

function QueueHeader({
  query,
  onQueryChange,
  tier,
  onTierChange,
  totals,
  onRefresh,
  refreshing,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  tier: TierFilter;
  onTierChange: (t: TierFilter) => void;
  totals: { all: number; T2: number; T1: number; T0: number };
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const filters: TierFilter[] = ['all', 'T2', 'T1', 'T0'];
  const label = (key: TierFilter) =>
    key === 'all' ? FILTER_META.all.label : `${FILTER_META[key].label} · ${totals[key]}`;
  return (
    <div className="border-b border-line-soft px-4 py-3.5">
      <div className="mb-2.5 flex items-baseline gap-2">
        <div className="text-[15px] font-semibold">Review queue</div>
        <div className="text-xs text-muted">{totals.all} open</div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="text-[11.5px] font-semibold text-brand hover:underline disabled:text-muted disabled:no-underline"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search case ref, worker…"
          aria-label="Search queue"
          className="w-full rounded-md border border-line bg-surface-alt py-[7px] pl-[30px] pr-2.5 text-[13px] outline-none focus:border-brand focus:bg-white"
        />
        <SearchIcon size={14} color="#8A97A2" className="absolute left-[9px] top-2" />
      </div>
      <div className="mt-2.5 flex gap-1 text-[11.5px]" role="group" aria-label="Filter by tier">
        {filters.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tier === key}
            onClick={() => onTierChange(key)}
            className={cn(
              'rounded-full px-2.5 py-1 font-semibold',
              tier === key ? 'bg-ink text-white' : FILTER_META[key].idle,
            )}
          >
            {label(key)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Full-height, centred pane content for empty / loading / error states. */
function QueueState({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-[13px]">{children}</div>;
}

export function ReviewQueue() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectReviewQueueStatus);
  const items = useAppSelector(selectReviewQueueItems);
  const error = useAppSelector(selectReviewQueueError);
  const totals = useAppSelector(selectReviewQueueTotals);

  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<TierFilter>('all');

  // Kick off the first load exactly once. Guarding on status === 'idle'
  // stops React 19 StrictMode's double-invoked dev effect from firing a
  // second request (the first mount flips status to 'loading', so the
  // remount short-circuits). Re-fetch is done via the Refresh button.
  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchReviewQueue());
    }
  }, [dispatch, status]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (tier === 'all' || item.tier === tier) &&
        (!q || [item.ref, item.title, item.worker].some((field) => field.toLowerCase().includes(q))),
    );
  }, [items, query, tier]);

  const refreshing = status === 'loading';
  const onRefresh = () => {
    dispatch(fetchReviewQueue());
  };

  const header = (
    <QueueHeader
      query={query}
      onQueryChange={setQuery}
      tier={tier}
      onTierChange={setTier}
      totals={totals}
      onRefresh={onRefresh}
      refreshing={refreshing}
    />
  );

  if (status === 'idle' || (status === 'loading' && items.length === 0)) {
    return (
      <QueueShell header={header}>
        <QueueState>
          <div className="flex flex-col items-center gap-2 text-muted">
            <Spinner />
            <span>Loading review queue…</span>
          </div>
        </QueueState>
      </QueueShell>
    );
  }

  if (status === 'failed' && items.length === 0) {
    return (
      <QueueShell header={header}>
        <QueueState>
          <div className="w-full max-w-[280px]">
            <Alert title="Couldn't load the queue">{error ?? 'Please try again.'}</Alert>
            <div className="mt-3">
              <Button size="sm" onClick={onRefresh}>
                Try again
              </Button>
            </div>
          </div>
        </QueueState>
      </QueueShell>
    );
  }

  if (items.length === 0) {
    return (
      <QueueShell header={header}>
        <QueueState>
          <div className="text-muted">No open cases in the queue right now.</div>
        </QueueState>
      </QueueShell>
    );
  }

  return (
    <QueueShell header={header}>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {filtered.map((item) => (
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
        {filtered.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-muted">No cases match.</li>}
      </ul>
    </QueueShell>
  );
}
