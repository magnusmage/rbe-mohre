import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/app/routes';
import type { ReviewQueueItemDto } from '@/services/review/reviewApi';
import { stubFetch, type FetchStubResponse } from '@/test/mocks/browserApis';
import { renderWithProviders } from '@/test/utils';
import { TIER_BADGE_TONE, TIER_LONG_LABEL, AUDIT_RESULT_TONE } from '../tiers';
import { ReviewQueue } from './ReviewQueue';

const NOW_S = Math.floor(Date.now() / 1000);

function itemDto(overrides: Partial<ReviewQueueItemDto> = {}): ReviewQueueItemDto {
  return {
    review_ref: 'RV-1790167201-0001',
    case_ref: 'LAB-1001',
    conversation_id: 'regression-1790167131-29363',
    tier: 'tier_0_standard_review',
    summary: 'July wage shortfall',
    decision: null,
    decided_by: null,
    decided_at: null,
    at: NOW_S - 120,
    transcript_ready: true,
    ...overrides,
  };
}

const THREE_ITEMS: ReviewQueueItemDto[] = [
  itemDto({
    review_ref: 'RV-2409-0031',
    case_ref: 'LAB-1002',
    tier: 'tier_2_mandatory_human',
    summary: 'Contested deduction · Jul 2026',
    at: NOW_S - 120,
    transcript_ready: true,
  }),
  itemDto({
    review_ref: 'RV-2409-0030',
    case_ref: 'LAB-1004',
    tier: 'tier_2_mandatory_human',
    summary: 'Payment timing · rule change month',
    at: NOW_S - 14 * 60,
    transcript_ready: false, // locked
  }),
  itemDto({
    review_ref: 'RV-2409-0028',
    case_ref: 'LAB-1010',
    tier: 'tier_1_priority_review',
    summary: 'WPS line missing · Jun 2026',
    at: NOW_S - 60 * 60,
    transcript_ready: true,
  }),
];

const renderQueue = (route = `${ROUTES.specialist}/RV-2409-0031`) =>
  renderWithProviders(<ReviewQueue />, {
    route,
    extraRoutes: [{ path: `${ROUTES.specialist}/:caseRef`, element: <ReviewQueue /> }],
  });

describe('ReviewQueue — API integration', () => {
  it('renders every case returned by the API with tier and link', async () => {
    stubFetch({ body: { items: THREE_ITEMS } });

    renderQueue();

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(THREE_ITEMS.length));
    expect(screen.getByText('3 open')).toBeInTheDocument();

    const items = screen.getAllByRole('listitem');
    const first = within(items[0]);
    expect(first.getByText('RV-2409-0031')).toBeInTheDocument();
    expect(first.getByText('T2')).toBeInTheDocument();
    expect(first.getByRole('link')).toHaveAttribute('href', `${ROUTES.specialist}/RV-2409-0031`);

    // Non-ready transcripts render the "decision locked" affordance.
    const locked = screen.getByText('RV-2409-0030').closest('a');
    expect(within(locked as HTMLElement).getByLabelText(/decision locked/i)).toBeInTheDocument();

    // Ready transcripts don't.
    const ready = screen.getByText('RV-2409-0031').closest('a');
    expect(within(ready as HTMLElement).queryByLabelText(/decision locked/i)).not.toBeInTheDocument();
  });

  it('sends the reviewer bearer token in the Authorization header', async () => {
    const { calls } = stubFetch({ body: { items: [] } });

    renderQueue();

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const call = calls[0];
    expect(call.url).toBe('http://api.test/review/queue');
    const headers = call.init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer test-reviewer-token');
    expect(headers?.Accept).toBe('application/json');
  });

  it('shows an empty-queue message when the API returns no items', async () => {
    stubFetch({ body: { items: [] } });

    renderQueue();

    await waitFor(() =>
      expect(screen.getByText(/no open cases in the queue right now/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('0 open')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('shows a loading state while the request is in flight', () => {
    stubFetch({ hang: true });

    renderQueue();

    expect(screen.getByText(/loading review queue/i)).toBeInTheDocument();
  });

  it('shows an error state when the request fails, and retries on click', async () => {
    const responses: FetchStubResponse[] = [
      { networkError: true },
      { body: { items: THREE_ITEMS } },
    ];
    const { calls } = stubFetch(responses);

    const { user } = renderQueue();

    await waitFor(() => expect(screen.getByText(/couldn't load the queue/i)).toBeInTheDocument());
    expect(screen.getByText(/couldn't reach the review service/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBe(THREE_ITEMS.length));
    expect(calls).toHaveLength(2);
  });

  it('surfaces an unauthorised response as a specific message', async () => {
    stubFetch({ status: 401, body: { detail: 'unauthorised' } });

    renderQueue();

    await waitFor(() =>
      expect(screen.getByText(/not authorised to load the review queue/i)).toBeInTheDocument(),
    );
  });

  it('filters by tier using totals derived from the API payload', async () => {
    stubFetch({ body: { items: THREE_ITEMS } });

    const { user } = renderQueue();

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(THREE_ITEMS.length));

    await user.click(screen.getByRole('button', { name: 'T1 · 1' }));
    const refs = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(refs).toHaveLength(1);
    expect(refs.join(' ')).toContain('RV-2409-0028');

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(THREE_ITEMS.length);
  });

  it('searches by reference, title and worker (case_ref)', async () => {
    stubFetch({ body: { items: THREE_ITEMS } });

    const { user } = renderQueue();

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(THREE_ITEMS.length));

    const search = screen.getByLabelText('Search queue');
    await user.type(search, 'timing');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('RV-2409-0030')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'LAB-1010');
    expect(screen.getByText('RV-2409-0028')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'nothing-matches-this');
    expect(screen.getByText('No cases match.')).toBeInTheDocument();
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
