import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import { fetchReviewQueue } from './reviewQueueSlice';

/**
 * Storage key for the reviewer bearer token. `sessionStorage` (not
 * `localStorage`) is intentional: the token is scoped to the tab and cleared
 * when the tab closes, so an idle machine cannot be picked up by someone else
 * long after the specialist walked away.
 *
 * Read/write is defensive because access can throw in restricted browsers
 * (private mode, storage blocked by an extension); failure to persist is not
 * an authentication failure — the token still works for this session in memory.
 */
const STORAGE_KEY = 'rbe:specialist:reviewer-token';

function readStoredToken(): string | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(STORAGE_KEY, token);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: storage is unavailable, but the in-memory token still works.
  }
}

export interface SpecialistAuthState {
  /**
   * The reviewer's VERIFIED bearer token — set only after the server confirms
   * it. Anything that gates UI on "signed in" (TopBar reviewer menu, layout
   * routing) must read this, not the pending one, so the navbar and screen
   * don't flicker while a submit is in flight.
   *
   * Held only in Redux state and mirrored to `sessionStorage`. Never read
   * from `import.meta.env` or a module-level variable — leaking it into the
   * bundle would ship a credential to every visitor.
   */
  token: string | null;
  /**
   * The token being verified right now. The HTTP interceptor reads either
   * `token` or `pendingToken` so the verification request itself can carry
   * the bearer, but no `isSignedIn` UI transitions until it is promoted.
   */
  pendingToken: string | null;
  /** True while the sign-in submit is waiting for its verification request. */
  verifying: boolean;
  /**
   * Message shown in the sign-in modal above the input. Set either by the
   * verification thunk (submit failed) or by the 401 interceptor handler
   * (a live session's token was rejected mid-flight).
   */
  error: string | null;
}

const initialState: SpecialistAuthState = {
  token: readStoredToken(),
  pendingToken: null,
  verifying: false,
  error: null,
};

const DEFAULT_REJECTED_MESSAGE = 'The token you entered is incorrect. Please try again.';

const specialistAuthSlice = createSlice({
  name: 'specialistAuth',
  initialState,
  reducers: {
    /**
     * Clears the reviewer token from Redux and sessionStorage. Used by the
     * Sign-out button; ends any in-flight verifying state and clears errors so
     * the modal reappears clean.
     */
    reviewerSignedOut(state) {
      state.token = null;
      state.pendingToken = null;
      state.verifying = false;
      state.error = null;
      writeStoredToken(null);
    },
    /**
     * The token was rejected by the server (401 on a reviewer endpoint). Clears
     * both the verified and pending tokens so the sign-in modal reopens, and
     * records a message the modal shows above the input. Called by the
     * response interceptor whenever a reviewer request comes back 401.
     */
    reviewerTokenRejected(state, action: PayloadAction<string | undefined>) {
      state.token = null;
      state.pendingToken = null;
      state.verifying = false;
      state.error = action.payload ?? DEFAULT_REJECTED_MESSAGE;
      writeStoredToken(null);
    },
    /** Dismisses the sign-in error, for the "×" affordance on the modal. */
    reviewerErrorDismissed(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(verifyReviewerToken.pending, (state, action) => {
        // Hold the unverified token in `pendingToken` only. `token` (which
        // drives `isSignedIn`) stays whatever it was, so the navbar and layout
        // do not switch modes mid-verify and then switch back on failure.
        state.pendingToken = action.meta.arg.trim() || null;
        state.verifying = true;
        state.error = null;
      })
      .addCase(verifyReviewerToken.fulfilled, (state) => {
        // Promote the verified token; only NOW does `isSignedIn` flip true.
        if (state.pendingToken) {
          state.token = state.pendingToken;
          writeStoredToken(state.token);
        }
        state.pendingToken = null;
        state.verifying = false;
      })
      .addCase(verifyReviewerToken.rejected, (state, action) => {
        state.verifying = false;
        state.pendingToken = null;
        // 401 already ran through the response interceptor and set a specific
        // message; keep that in preference to the generic thunk payload.
        if (!state.error) state.error = action.payload ?? DEFAULT_REJECTED_MESSAGE;
      });
  },
});

/**
 * Stores the supplied token as a pending candidate and then confirms it with a
 * live API call. Any status other than a successful queue fetch leaves the
 * modal open with the failure surfaced — a 401 clears the token (via the
 * response interceptor); a transient error keeps any already-verified token
 * so the reviewer can retry.
 *
 * The verification piggy-backs on `fetchReviewQueue` because that is the very
 * next request the layout would make anyway — sending a probe request first
 * would double the traffic and give the server nothing new to check.
 */
export const verifyReviewerToken = createAsyncThunk<
  void,
  string,
  { state: RootState; rejectValue: string }
>('specialistAuth/verify', async (_token, { dispatch, rejectWithValue }) => {
  // `pending` reducer has already stored the trimmed token in `pendingToken`,
  // which the interceptor picks up when it needs a bearer for this request.
  const result = await dispatch(fetchReviewQueue());
  if (fetchReviewQueue.rejected.match(result)) {
    return rejectWithValue(result.payload ?? 'Sign-in verification failed.');
  }
});

export const { reviewerSignedOut, reviewerTokenRejected, reviewerErrorDismissed } =
  specialistAuthSlice.actions;
export const specialistAuthReducer = specialistAuthSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * The bearer to attach to reviewer requests. Falls back to the pending token
 * so the verification request itself can be authenticated; the moment the
 * fetch settles, the pending value is cleared or promoted.
 */
export const selectReviewerToken = (state: RootState) =>
  state.specialistAuth.token ?? state.specialistAuth.pendingToken;

/**
 * Whether the reviewer is signed in for UI purposes. Reads the VERIFIED token
 * only — an in-flight submit does not count, so the TopBar reviewer menu and
 * the SpecialistLayout content don't flicker between states while verifying.
 */
export const selectIsReviewerSignedIn = (state: RootState) => state.specialistAuth.token !== null;
export const selectReviewerSignInVerifying = (state: RootState) => state.specialistAuth.verifying;
export const selectReviewerSignInError = (state: RootState) => state.specialistAuth.error;

// Exposed for tests that need to reset sessionStorage between cases.
export const REVIEWER_TOKEN_STORAGE_KEY = STORAGE_KEY;
