import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/app/routes';
import type { ReviewCaseResponse } from '@/services/review/reviewApi';
import { stubFetch } from '@/test/mocks/browserApis';
import { renderRoutes, renderWithProviders } from '@/test/utils';
import { CaseReviewScreen } from './CaseReviewScreen';
import { SpecialistLayout } from './SpecialistLayout';

const CASE_REF = 'RV-1790167201-0001';
const SECOND_REF = 'RV-2409-0028';

function makeCaseResponse(overrides: Partial<ReviewCaseResponse> = {}): ReviewCaseResponse {
  const base: ReviewCaseResponse = {
    ok: true,
    review: {
      review_ref: CASE_REF,
      case_ref: 'LAB-1001',
      conversation_id: 'regression-1790167131-29363',
      tier: 'tier_0_standard_review',
      summary: 'Regression test: July wage shortfall',
      decision: null,
      decided_by: null,
      decided_at: null,
      transcript_ready: false,
    },
    package: { allegations: [] },
    allegations: [],
    draft: {
      draft_ref: 'DR-1790167834-0002',
      case_ref: 'LAB-1001',
      worker_confirmed: 1,
      filed: 0,
      at: 1790167834.4899392,
      body: {
        summary: 'Regression test: July wage shortfall',
        allegations: [],
        verified_findings: [
          {
            action: 'check_wage',
            check: 'wage',
            status: 'discrepancy',
            explanation:
              'Contract total wage AED 5000.00; WPS shows AED 4000.00 for 2026-07; difference AED 1000.00.',
            findings: [
              {
                code: 'WAGE_SHORTFALL',
                detail:
                  'Contract total wage AED 5000.00; WPS shows AED 4000.00 for 2026-07; difference AED 1000.00',
                rule_id: 'CONTRACT-VS-WPS',
                source: 'Employment contract; WPS record',
                verified: true,
                amount: '1000.00',
              },
            ],
          },
        ],
        filed: false,
      },
    },
    transcript: null,
    audit: [
      {
        id: 1,
        at: 1790157523.4567885,
        actor: 'agent',
        action: 'verify_session',
        conversation_id: 'manual-test-001',
        case_ref: 'LAB-1001',
        result: 'verified',
        detail: null,
      },
      {
        id: 13,
        at: 1790167166.3639028,
        actor: 'agent',
        action: 'check_wage',
        conversation_id: 'regression-1790167131-29363',
        case_ref: 'LAB-1001',
        result: 'discrepancy',
        detail: JSON.stringify({
          tier: 'tier_0_standard_review',
          rules: ['CONTRACT-VS-WPS'],
          check_result: {
            check: 'wage',
            status: 'discrepancy',
            findings: [
              {
                code: 'WAGE_SHORTFALL',
                detail:
                  'Contract total wage AED 5000.00; WPS shows AED 4000.00 for 2026-07; difference AED 1000.00',
                rule_id: 'CONTRACT-VS-WPS',
                verified: true,
              },
            ],
            tier: 'tier_0_standard_review',
            say: 'Contract total wage AED 5000.00; WPS shows AED 4000.00 for 2026-07; difference AED 1000.00.',
          },
        }),
      },
      {
        id: 14,
        at: 1790167201.3635097,
        actor: 'agent',
        action: 'send_to_review',
        conversation_id: 'regression-1790167131-29363',
        case_ref: 'LAB-1001',
        result: 'queued',
        detail: JSON.stringify({ review_ref: CASE_REF, tier: 'tier_0_standard_review' }),
      },
    ],
    ...overrides,
  };
  return base;
}

const renderCase = (ref = CASE_REF) =>
  renderWithProviders(<CaseReviewScreen />, {
    route: `${ROUTES.specialist}/${ref}`,
    path: `${ROUTES.specialist}/:caseRef`,
  });

describe('CaseReviewScreen — data loading', () => {
  it('sends GET /review/{ref} with the reviewer bearer token', async () => {
    const { calls } = stubFetch({ body: makeCaseResponse() });

    renderCase();

    await waitFor(() =>
      expect(calls[0]?.url).toBe(`http://api.test/review/${encodeURIComponent(CASE_REF)}`),
    );
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-reviewer-token');
    expect(headers.Accept).toBe('application/json');
  });

  it('shows a skeleton while the case is loading', () => {
    stubFetch({ hang: true });

    renderCase();

    expect(screen.getByText(/loading case pack/i)).toBeInTheDocument();
    expect(screen.getByText(CASE_REF)).toBeInTheDocument();
  });

  it('renders the case pack once the response arrives', async () => {
    stubFetch({ body: makeCaseResponse() });

    renderCase();

    expect(
      await screen.findByRole('heading', { level: 1, name: /regression test: july wage shortfall/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('TIER 0')).toBeInTheDocument();
    // LAB-1001 shows in both the header and other places; header uses the mono class.
    expect(screen.getAllByText('LAB-1001').length).toBeGreaterThan(0);
    expect(screen.getByText(/DR-1790167834-0002/)).toBeInTheDocument();
    expect(screen.getByText(/WAGE_SHORTFALL/)).toBeInTheDocument();
    expect(screen.getByText(/Amount AED 1000\.00/)).toBeInTheDocument();
  });

  it('lists the audit rows in the agent activity table', async () => {
    stubFetch({ body: makeCaseResponse() });

    renderCase();
    await screen.findByRole('heading', { level: 1 });

    const main = screen.getByRole('main');
    const rows = within(main).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('check_wage')).toBeInTheDocument();
    expect(within(rows[1]).getByText('discrepancy')).toBeInTheDocument();
  });

  it('shows the transcript-pending banner when transcript is not ready', async () => {
    stubFetch({ body: makeCaseResponse() });
    renderCase();

    const banner = (await screen.findAllByRole('status'))[0];
    expect(banner).toHaveTextContent(/decision locked/i);
  });

  it('unlocks the decision panel once the transcript is stored', async () => {
    stubFetch({
      body: makeCaseResponse({
        review: { ...makeCaseResponse().review, transcript_ready: true },
      }),
    });
    renderCase();
    await screen.findByRole('heading', { level: 1 });

    const banners = screen.getAllByRole('status');
    expect(banners.some((b) => /ready to decide/i.test(b.textContent ?? ''))).toBe(true);
  });
});

describe('CaseReviewScreen — empty states', () => {
  it('shows the empty state for allegations and draft when none exist', async () => {
    stubFetch({
      body: makeCaseResponse({ allegations: [], draft: null, audit: [] }),
    });

    renderCase();
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByText(/the caller made no allegations/i)).toBeInTheDocument();
    expect(screen.getByText(/no complaint draft was prepared/i)).toBeInTheDocument();
    expect(screen.getByText(/no agent activity has been recorded/i)).toBeInTheDocument();
  });

  it('shows the empty state for transcript when none is stored', async () => {
    stubFetch({
      body: makeCaseResponse({
        review: { ...makeCaseResponse().review, transcript_ready: true },
        transcript: null,
      }),
    });

    renderCase();
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByText(/no transcript is stored/i)).toBeInTheDocument();
  });
});

describe('CaseReviewScreen — error paths', () => {
  it('shows a not-found state for an invalid review ref', async () => {
    stubFetch({ status: 404, body: { ok: false, error: 'not_found' } });

    renderCase('RV-does-not-exist');

    expect(
      await screen.findByText(/case pack not available/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('shows an error alert with retry on a network failure', async () => {
    const { calls } = stubFetch([{ networkError: true }, { body: makeCaseResponse() }]);

    const { user } = renderCase();

    expect(await screen.findByText(/couldn't load this case/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await screen.findByRole('heading', { level: 1 });
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('CaseReviewScreen — navigation between cases', () => {
  it('fetches the URL case on refresh (no default override)', async () => {
    const { calls } = stubFetch({ body: makeCaseResponse({
      review: { ...makeCaseResponse().review, review_ref: SECOND_REF, summary: 'Deep-linked case' },
    }) });

    renderWithProviders(<CaseReviewScreen />, {
      route: `${ROUTES.specialist}/${SECOND_REF}`,
      path: `${ROUTES.specialist}/:caseRef`,
    });

    expect(await screen.findByRole('heading', { level: 1, name: /deep-linked case/i })).toBeInTheDocument();
    expect(calls[0].url).toBe(`http://api.test/review/${encodeURIComponent(SECOND_REF)}`);
  });

  it('updates the URL and fetches a new case when a queue item is picked', async () => {
    const { calls } = stubFetch([
      // Initial queue load for the layout.
      {
        body: {
          items: [
            {
              review_ref: CASE_REF,
              case_ref: 'LAB-1001',
              conversation_id: 'c1',
              tier: 'tier_0_standard_review',
              summary: 'First',
              decision: null,
              decided_by: null,
              decided_at: null,
              at: Math.floor(Date.now() / 1000) - 60,
              transcript_ready: true,
            },
            {
              review_ref: SECOND_REF,
              case_ref: 'LAB-1010',
              conversation_id: 'c2',
              tier: 'tier_1_priority_review',
              summary: 'Second',
              decision: null,
              decided_by: null,
              decided_at: null,
              at: Math.floor(Date.now() / 1000) - 120,
              transcript_ready: true,
            },
          ],
        },
      },
      { body: makeCaseResponse() },
      {
        body: makeCaseResponse({
          review: { ...makeCaseResponse().review, review_ref: SECOND_REF, summary: 'Second case' },
        }),
      },
    ]);

    const { user, location } = renderRoutes(
      [
        {
          path: ROUTES.specialist,
          element: <SpecialistLayout />,
          children: [{ path: ':caseRef', element: <CaseReviewScreen /> }],
        },
      ],
      { route: `${ROUTES.specialist}/${CASE_REF}` },
    );

    await screen.findByRole('heading', { level: 1, name: /regression test/i });

    await user.click(screen.getByText(SECOND_REF));

    await waitFor(() => expect(location()).toBe(`${ROUTES.specialist}/${SECOND_REF}`));
    expect(await screen.findByRole('heading', { level: 1, name: /second case/i })).toBeInTheDocument();

    // Queue + first case + second case = 3 requests to /review/*.
    const caseCalls = calls.filter((c) => c.url.includes('/review/'));
    expect(caseCalls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('CaseReviewScreen — miscellaneous', () => {
  it('offers a printable pack once loaded', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    stubFetch({ body: makeCaseResponse() });

    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('button', { name: /print pack/i }));
    expect(print).toHaveBeenCalled();
  });

  it('shows a no-case state when the route has no case ref', () => {
    // This isn't reachable via routing, but the guard keeps the component robust.
    renderWithProviders(<CaseReviewScreen />, {
      route: '/specialist/',
      path: '/specialist/*',
    });

    expect(screen.getByText(/no case selected/i)).toBeInTheDocument();
  });
});

