import { beforeEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test/mocks/browserApis';
import { makeStore } from '@/test/utils';
import {
  reviewerErrorDismissed,
  reviewerSignedOut,
  reviewerTokenRejected,
  selectIsReviewerSignedIn,
  selectReviewerSignInError,
  selectReviewerSignInVerifying,
  selectReviewerToken,
  specialistAuthReducer,
  verifyReviewerToken,
  REVIEWER_TOKEN_STORAGE_KEY,
  type SpecialistAuthState,
} from './specialistAuthSlice';

const initial: SpecialistAuthState = { token: null, pendingToken: null, verifying: false, error: null };

/** Redux-shaped root scoped to this slice, for selector tests. */
const asRoot = (overrides: Partial<SpecialistAuthState> = {}) => ({
  specialistAuth: { ...initial, ...overrides },
});

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('specialistAuth reducer', () => {
  it('starts with no token, not verifying, no error', () => {
    expect(specialistAuthReducer(initial, { type: '@@init' })).toEqual(initial);
  });

  it('signOut clears BOTH the verified and pending tokens plus sessionStorage', () => {
    const start: SpecialistAuthState = {
      token: 'abc',
      pendingToken: 'other',
      verifying: true,
      error: 'stale',
    };
    window.sessionStorage.setItem(REVIEWER_TOKEN_STORAGE_KEY, 'abc');

    const state = specialistAuthReducer(start, reviewerSignedOut());
    expect(state).toEqual({ token: null, pendingToken: null, verifying: false, error: null });
    expect(window.sessionStorage.getItem(REVIEWER_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('tokenRejected clears both tokens and records the error', () => {
    window.sessionStorage.setItem(REVIEWER_TOKEN_STORAGE_KEY, 'abc');
    const state = specialistAuthReducer(
      { token: 'abc', pendingToken: 'candidate', verifying: true, error: null },
      reviewerTokenRejected('Session expired.'),
    );
    expect(state.token).toBeNull();
    expect(state.pendingToken).toBeNull();
    expect(state.error).toBe('Session expired.');
    expect(window.sessionStorage.getItem(REVIEWER_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('tokenRejected falls back to a default message', () => {
    const state = specialistAuthReducer(
      { token: 'abc', pendingToken: null, verifying: false, error: null },
      reviewerTokenRejected(),
    );
    expect(state.error).toMatch(/incorrect|try again|rejected/i);
  });

  it('errorDismissed clears the modal error only', () => {
    const state = specialistAuthReducer(
      { token: null, pendingToken: null, verifying: false, error: 'oops' },
      reviewerErrorDismissed(),
    );
    expect(state).toEqual({ token: null, pendingToken: null, verifying: false, error: null });
  });
});

describe('specialistAuth selectors', () => {
  it('reports whether a reviewer is signed in based on the VERIFIED token only', () => {
    expect(selectIsReviewerSignedIn(asRoot() as never)).toBe(false);
    expect(selectIsReviewerSignedIn(asRoot({ token: 'abc' }) as never)).toBe(true);
    // A pending (in-flight, unverified) token must NOT flip isSignedIn — that
    // would cause the TopBar and layout to flash into signed-in mode during
    // verification and then flash back on rejection.
    expect(selectIsReviewerSignedIn(asRoot({ pendingToken: 'candidate' }) as never)).toBe(false);
    expect(selectReviewerSignInVerifying(asRoot({ verifying: true }) as never)).toBe(true);
    expect(selectReviewerSignInError(asRoot({ error: 'nope' }) as never)).toBe('nope');
  });

  it('selectReviewerToken prefers the verified token, then falls back to the pending one', () => {
    // Interceptor must be able to authenticate the verification request itself,
    // so the pending token is what it reaches for when no verified token exists.
    expect(selectReviewerToken(asRoot() as never)).toBeNull();
    expect(selectReviewerToken(asRoot({ pendingToken: 'candidate' }) as never)).toBe('candidate');
    expect(selectReviewerToken(asRoot({ token: 'verified', pendingToken: 'candidate' }) as never)).toBe(
      'verified',
    );
  });
});

describe('verifyReviewerToken thunk', () => {
  it('stores the token, verifies with the queue endpoint, and signs the reviewer in on 200', async () => {
    const store = makeStore(undefined, undefined, undefined, { token: null });
    const { calls } = stubFetch({ body: { items: [] } });

    await store.dispatch(verifyReviewerToken('  good-token  '));

    const auth = store.getState().specialistAuth;
    expect(auth.token).toBe('good-token');
    expect(auth.verifying).toBe(false);
    expect(auth.error).toBeNull();
    // Verification traveled over the interceptor as a bearer, never a URL param.
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer good-token');
    expect(calls[0].url).not.toContain('good-token');
  });

  it('marks the state verifying while the request is in flight', async () => {
    const store = makeStore(undefined, undefined, undefined, { token: null });
    // Slow success rather than an indefinite hang so we don't need to wire
    // AbortSignals into the inner fetchReviewQueue thunk to unblock the test.
    stubFetch({ body: { items: [] } });

    const promise = store.dispatch(verifyReviewerToken('t'));
    // The pending action fires synchronously; assert BEFORE awaiting the promise.
    expect(store.getState().specialistAuth.verifying).toBe(true);
    await promise;
    expect(store.getState().specialistAuth.verifying).toBe(false);
  });

  it('does NOT flip isSignedIn mid-verify — only the pending token holds the value', async () => {
    const store = makeStore(undefined, undefined, undefined, { token: null });
    // Hanging response holds the state in the verifying phase so we can inspect it.
    stubFetch({ hang: true });

    const promise = store.dispatch(verifyReviewerToken('candidate'));

    const midFlight = store.getState().specialistAuth;
    // TopBar / SpecialistLayout must not see a "signed in" state during verify,
    // or they flash into the signed-in layout and then back on rejection.
    expect(selectIsReviewerSignedIn({ specialistAuth: midFlight } as never)).toBe(false);
    // But the interceptor still needs a bearer for the verification request.
    expect(selectReviewerToken({ specialistAuth: midFlight } as never)).toBe('candidate');
    expect(midFlight.token).toBeNull();
    expect(midFlight.pendingToken).toBe('candidate');

    // The verified token must NOT be persisted before the server confirmed it —
    // a page reload during verify should NOT count as a signed-in session.
    expect(window.sessionStorage.getItem(REVIEWER_TOKEN_STORAGE_KEY)).toBeNull();

    // Clean up the hanging request so it doesn't leak into the next test.
    promise.abort();
    await promise;
  });

  it('clears the token and surfaces the "rejected" error on a 401', async () => {
    const store = makeStore(undefined, undefined, undefined, { token: null });
    stubFetch({ status: 401, body: { detail: 'invalid' } });

    await store.dispatch(verifyReviewerToken('wrong-token'));

    const auth = store.getState().specialistAuth;
    expect(auth.token).toBeNull();
    expect(auth.verifying).toBe(false);
    expect(auth.error).toMatch(/incorrect|Please try again/i);
  });

  it('does not sign the reviewer in when verification fails with a non-401 error', async () => {
    const store = makeStore(undefined, undefined, undefined, { token: null });
    stubFetch({ networkError: true });

    await store.dispatch(verifyReviewerToken('unproven'));

    const auth = store.getState().specialistAuth;
    // No token is promoted — we never confirmed the server accepts it.
    expect(auth.token).toBeNull();
    expect(auth.pendingToken).toBeNull();
    expect(auth.verifying).toBe(false);
    // The modal stays open and surfaces the transient error so the reviewer retries.
    expect(auth.error).toMatch(/couldn't reach|try again|failed/i);
  });
});

describe('unauthorized handler (interceptor → sign-in modal)', () => {
  it('drops the token and sets an error the modal will show', async () => {
    const store = makeStore(); // signed in with the test token by default
    stubFetch({ status: 401, body: { detail: 'expired' } });

    // Any reviewer request lands the interceptor's 401 handler.
    const { fetchReviewQueue } = await import('./reviewQueueSlice');
    await store.dispatch(fetchReviewQueue());

    const auth = store.getState().specialistAuth;
    expect(auth.token).toBeNull();
    expect(auth.error).toMatch(/incorrect|Please try again/i);
  });
});
