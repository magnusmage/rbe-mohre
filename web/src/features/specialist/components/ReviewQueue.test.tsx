import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/app/routes';
import { QUEUE, QUEUE_TOTALS } from '@/data/mock';
import { renderWithProviders } from '@/test/utils';
import { TIER_BADGE_TONE, TIER_LONG_LABEL, AUDIT_RESULT_TONE } from '../tiers';
import { ReviewQueue } from './ReviewQueue';

const renderQueue = (route = `${ROUTES.specialist}/RV-2409-0031`) =>
  renderWithProviders(<ReviewQueue />, {
    route,
    extraRoutes: [{ path: `${ROUTES.specialist}/:caseRef`, element: <ReviewQueue /> }],
  });

describe('ReviewQueue', () => {
  it('lists the open cases with their tier and links to each one', () => {
    renderQueue();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(QUEUE.length);
    expect(screen.getByText(`${QUEUE_TOTALS.all} open`)).toBeInTheDocument();

    const first = within(items[0]);
    expect(first.getByText('RV-2409-0031')).toBeInTheDocument();
    expect(first.getByText('T2')).toBeInTheDocument();
    expect(first.getByRole('link')).toHaveAttribute('href', `${ROUTES.specialist}/RV-2409-0031`);
  });

  it('marks the case being reviewed as current', () => {
    renderQueue(`${ROUTES.specialist}/RV-2409-0030`);

    const active = screen.getByRole('link', { current: 'page' });
    expect(active).toHaveTextContent('RV-2409-0030');
  });

  it('flags a case whose decision is still locked', () => {
    renderQueue();
    const locked = screen.getByText('RV-2409-0030').closest('a');
    expect(within(locked as HTMLElement).getByLabelText(/decision locked/i)).toBeInTheDocument();
  });

  it('filters by tier', async () => {
    const { user } = renderQueue();

    await user.click(screen.getByRole('button', { name: `T1 · ${QUEUE_TOTALS.T1}` }));

    const refs = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(refs).toHaveLength(QUEUE.filter((q) => q.tier === 'T1').length);
    expect(refs.join(' ')).not.toContain('RV-2409-0031');

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(QUEUE.length);
  });

  it('searches by reference, title and worker', async () => {
    const { user } = renderQueue();
    const search = screen.getByLabelText('Search queue');

    await user.type(search, 'gulf');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('RV-2409-0030')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'deduction');
    expect(screen.getByText('RV-2409-0031')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'RV-2409-0026');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('says so when nothing matches', async () => {
    const { user } = renderQueue();

    await user.type(screen.getByLabelText('Search queue'), 'nothing-matches-this');

    expect(screen.getByText('No cases match.')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(1);
  });

  it('combines the tier filter with the search', async () => {
    const { user } = renderQueue();

    await user.click(screen.getByRole('button', { name: `T2 · ${QUEUE_TOTALS.T2}` }));
    await user.type(screen.getByLabelText('Search queue'), 'domestic');

    expect(screen.getByText('RV-2409-0029')).toBeInTheDocument();
    expect(screen.queryByText('RV-2409-0031')).not.toBeInTheDocument();
  });
});

describe('tier mappings', () => {
  it('gives each tier its own badge tone and long label', () => {
    expect(TIER_BADGE_TONE).toEqual({ T2: 'danger', T1: 'warning', T0: 'neutral' });
    expect(TIER_LONG_LABEL.T2).toBe('TIER 2 · MANDATORY QUALIFIED');
  });

  it('maps audit results to tones', () => {
    expect(AUDIT_RESULT_TONE.ok).toBe('success');
    expect(AUDIT_RESULT_TONE.stored).toBe('success');
    expect(AUDIT_RESULT_TONE.discrepancy).toBe('warning');
    expect(AUDIT_RESULT_TONE.refused).toBe('danger');
  });
});
