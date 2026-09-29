import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVIEWER_TOKEN_STORAGE_KEY } from '@/features/specialist/state/specialistAuthSlice';
import type { FetchStubResponse } from '@/test/mocks/browserApis';
import { ROUTES } from './routes';

const FIRST_QUEUE_REF = 'RV-2409-0031';

/** Minimal review-case response the CaseReviewScreen can render without complaint. */
function caseBody(reviewRef: string, summary: string) {
  return {
    ok: true,
    review: {
      review_ref: reviewRef,
      case_ref: 'LAB-1002',
      conversation_id: 'conv_1',
      tier: 'tier_2_mandatory_human',
      summary,
      decision: null,
      decided_by: null,
      decided_at: null,
      transcript_ready: true,
    },
    package: { allegations: [] },
    allegations: [],
    draft: null,
    transcript: null,
    audit: [],
  };
}

/**
 * The router is created when the module loads, so each entry URL needs a fresh
 * import. `vi.resetModules()` also gives us a fresh Axios `httpClient`, so we
 * re-import `stubFetch` afterwards and queue up the specialist responses
 * (queue + case detail) that the screens will fetch on mount.
 */
async function renderAppAt(path: string, responses: FetchStubResponse[] = [{ body: { items: [] } }]) {
  window.history.pushState({}, '', path);
  vi.resetModules();
  const { stubFetch } = await import('@/test/mocks/browserApis');
  stubFetch(responses);
  // Re-import makeStore AFTER resetModules so it uses the same fresh modules
  // as App — its `setReviewerTokenProvider` call must target the same
  // apiClient module that App and stubFetch touched, or the interceptor will
  // read a token from a different (empty) store.
  const { makeStore } = await import('@/test/utils');
  const { App } = await import('./App');
  return render(
    <Provider store={makeStore()}>
      <App />
    </Provider>,
  );
}

beforeEach(() => {
  vi.resetModules();
  // Seed the reviewer token in sessionStorage so the freshly-imported store
  // (loaded by `App`) starts already signed in. Without this, the specialist
  // routes would show the sign-in modal instead of fetching cases.
  window.sessionStorage.setItem(REVIEWER_TOKEN_STORAGE_KEY, 'test-reviewer-token');
});
afterEach(() => {
  window.history.pushState({}, '', '/');
  window.sessionStorage.clear();
});

describe('App routing', () => {
  it('sends the root URL to the start of the caller flow', async () => {
    await renderAppAt('/');

    await waitFor(() => expect(window.location.pathname).toBe(ROUTES.callerReady));
    expect(screen.getByRole('button', { name: /start call/i })).toBeInTheDocument();
  });

  it('sends a bare /caller to the same place', async () => {
    await renderAppAt(ROUTES.caller);
    await waitFor(() => expect(window.location.pathname).toBe(ROUTES.callerReady));
  });

  it('opens the first queued case from /specialist', async () => {
    await renderAppAt(ROUTES.specialist, [
      {
        body: {
          items: [
            {
              review_ref: FIRST_QUEUE_REF,
              case_ref: 'LAB-1002',
              conversation_id: 'conv_1',
              tier: 'tier_2_mandatory_human',
              summary: 'Contested deduction · Jul 2026',
              decision: null,
              decided_by: null,
              decided_at: null,
              at: Math.floor(Date.now() / 1000) - 120,
              transcript_ready: true,
            },
          ],
        },
      },
      { body: caseBody(FIRST_QUEUE_REF, 'Contested deduction · Jul 2026') },
    ]);

    await waitFor(() => expect(window.location.pathname).toBe(`${ROUTES.specialist}/${FIRST_QUEUE_REF}`));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Contested deduction'),
    );
  });

  it('sends an unknown URL home', async () => {
    await renderAppAt('/nope/not-a-page');

    await waitFor(() => expect(window.location.pathname).toBe(ROUTES.callerReady));
  });

  it('renders the console shell around every screen', async () => {
    await renderAppAt(ROUTES.callerReady);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });
});
