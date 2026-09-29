import { configureStore } from '@reduxjs/toolkit';
import { render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { vi } from 'vitest';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { LanguageProvider } from '@/context/LanguageContext';
import { callSessionReducer, type CallSessionState } from '@/features/caller/state/callSessionSlice';
import { caseReducer, type CaseState } from '@/features/specialist/state/caseSlice';
import {
  reviewQueueReducer,
  type ReviewQueueState,
} from '@/features/specialist/state/reviewQueueSlice';
import {
  selectReviewerToken,
  specialistAuthReducer,
  type SpecialistAuthState,
} from '@/features/specialist/state/specialistAuthSlice';
import type { RootState } from '@/store';
import { setReviewerTokenProvider, setUnauthorizedHandler } from '@/services/http/apiClient';

/** The slice's own initial state, used as the base for seeded test states. */
export const initialCallSession: CallSessionState = callSessionReducer(undefined, { type: '@@test/init' });
export const initialReviewQueue: ReviewQueueState = reviewQueueReducer(undefined, { type: '@@test/init' });
export const initialCase: CaseState = caseReducer(undefined, { type: '@@test/init' });
/**
 * Default specialistAuth state for tests: signed in with a fixed test token.
 * Sign-out / sign-in specific tests override this by passing a
 * `{ token: null }` (or a different token) into `makeStore`.
 */
export const TEST_REVIEWER_TOKEN = 'test-reviewer-token';
export const initialSpecialistAuth: SpecialistAuthState = {
  token: TEST_REVIEWER_TOKEN,
  pendingToken: null,
  verifying: false,
  error: null,
};

/** Fresh store per test; accepts partial slice states as the starting point. */
export function makeStore(
  callSession?: Partial<CallSessionState>,
  reviewQueue?: Partial<ReviewQueueState>,
  caseState?: Partial<CaseState>,
  specialistAuth?: Partial<SpecialistAuthState>,
) {
  const preloadedState = {
    callSession: { ...initialCallSession, ...callSession },
    reviewQueue: { ...initialReviewQueue, ...reviewQueue },
    case: { ...initialCase, ...caseState },
    specialistAuth: { ...initialSpecialistAuth, ...specialistAuth },
  };
  const store = configureStore({
    reducer: {
      callSession: callSessionReducer,
      reviewQueue: reviewQueueReducer,
      case: caseReducer,
      specialistAuth: specialistAuthReducer,
    },
    preloadedState,
  });
  // Re-wire the HTTP layer so its interceptors read tokens from THIS store.
  // The real `store/index.ts` does the same wiring for the app; tests need it
  // per-store so a signed-out fixture doesn't accidentally leak a token from
  // an earlier test's store.
  // Selector picks the verified token first, then falls back to the pending one
  // so an in-flight sign-in verification can still authenticate its own probe.
  setReviewerTokenProvider(() => selectReviewerToken(store.getState()));
  setUnauthorizedHandler(() => {
    if (selectReviewerToken(store.getState())) {
      // Mirrors the production store's 401 handler: 401 → token cleared +
      // error set → sign-in modal reopens. Uses the reducer's action creator
      // shape so tests exercise the same code path as the real app.
      store.dispatch({
        type: 'specialistAuth/reviewerTokenRejected',
        payload: 'The token you entered is incorrect. Please try again.',
      });
    }
  });
  return store;
}

/** Seeded state for a live call, as it looks right after `startCall` succeeds. */
export function connectedCallSession(overrides: Partial<CallSessionState> = {}): Partial<CallSessionState> {
  return {
    status: 'connected',
    conversationId: 'conv_1',
    agentStatus: 'connected',
    startedAt: Date.now(),
    durationSeconds: null,
    ...overrides,
  };
}

export type TestStore = ReturnType<typeof makeStore>;

/** user-event that cooperates with fake timers when a test installs them. */
export const setupUser = () =>
  userEvent.setup({
    advanceTimers: (ms) => {
      if (vi.isFakeTimers()) vi.advanceTimersByTime(ms);
    },
  });

interface RenderOptions {
  store?: TestStore;
  /** URL the router starts at. */
  route?: string;
  /** Route pattern the component is mounted at, when it reads params (defaults to `route`). */
  path?: string;
  /** Extra routes, so navigation away from the component can be asserted. */
  extraRoutes?: RouteObject[];
}

interface RenderWithProvidersResult extends RenderResult {
  store: TestStore;
  user: ReturnType<typeof userEvent.setup>;
  /** Current router location, for navigation assertions. */
  location: () => string;
}

/**
 * Renders inside the app's real providers and a data router (required by `useBlocker`).
 */
export function renderWithProviders(
  ui: ReactElement,
  { store = makeStore(), route = '/', path, extraRoutes = [] }: RenderOptions = {},
): RenderWithProvidersResult {
  const router = createMemoryRouter(
    [{ path: path ?? route, element: ui }, ...extraRoutes, { path: '*', element: <div data-testid="elsewhere" /> }],
    { initialEntries: [route] },
  );

  const result = render(
    <Provider store={store}>
      <LanguageProvider>
        <RouterProvider router={router} />
      </LanguageProvider>
    </Provider>,
  );

  return {
    ...result,
    store,
    user: setupUser(),
    location: () => router.state.location.pathname,
  };
}

/** Renders a set of routes (for routing/flow tests) rather than a single element. */
export function renderRoutes(routes: RouteObject[], { store = makeStore(), route = '/' }: RenderOptions = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const result = render(
    <Provider store={store}>
      <LanguageProvider>
        <RouterProvider router={router} />
      </LanguageProvider>
    </Provider>,
  );
  return {
    ...result,
    store,
    user: setupUser(),
    location: () => router.state.location.pathname,
  };
}

export function wrapWithProviders(children: ReactNode, store: TestStore = makeStore()) {
  return (
    <Provider store={store}>
      <LanguageProvider>{children}</LanguageProvider>
    </Provider>
  );
}

export const selectCallSession = (store: TestStore) => (store.getState() as RootState).callSession;
