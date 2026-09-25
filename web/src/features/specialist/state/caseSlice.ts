import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import { ApiError } from '@/services/http/apiClient';
import {
  getReviewCase,
  postReviewDecision,
  type CaseView,
  type DecisionRequest,
  type DecisionResponse,
} from '@/services/review/reviewApi';

export type CaseStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type CaseErrorKind = 'not-found' | 'unauthorised' | 'other';

export interface CaseErrorInfo {
  kind: CaseErrorKind;
  message: string;
}

export type SubmissionStatus = 'idle' | 'submitting' | 'succeeded' | 'failed';

export interface DecisionSubmissionState {
  status: SubmissionStatus;
  /** The decision code that was successfully recorded. */
  decision: string | null;
  /** The review_ref the recorded decision belongs to. */
  reviewRef: string | null;
  error: string | null;
}

const initialSubmission: DecisionSubmissionState = {
  status: 'idle',
  decision: null,
  reviewRef: null,
  error: null,
};

export interface CaseState {
  /** Ref of the case currently loaded or being loaded (or last requested). */
  currentRef: string | null;
  status: CaseStatus;
  data: CaseView | null;
  error: CaseErrorInfo | null;
  submission: DecisionSubmissionState;
}

const initialState: CaseState = {
  currentRef: null,
  status: 'idle',
  data: null,
  error: null,
  submission: initialSubmission,
};

function classify(error: unknown): CaseErrorInfo {
  if (error instanceof ApiError) {
    if (error.kind === 'http') {
      if (error.status === 404) {
        return { kind: 'not-found', message: `We couldn't find that case.` };
      }
      if (error.status === 401 || error.status === 403) {
        return {
          kind: 'unauthorised',
          message: 'Not authorised to load this case. Check the reviewer token.',
        };
      }
      return { kind: 'other', message: error.message || `Request failed with status ${error.status ?? 'unknown'}.` };
    }
    if (error.kind === 'network') {
      return { kind: 'other', message: "Couldn't reach the review service. Check your connection and try again." };
    }
    if (error.kind === 'timeout') {
      return { kind: 'other', message: 'The review service took too long to respond. Try again in a moment.' };
    }
    if (error.kind === 'parse') {
      return { kind: 'other', message: 'The review service returned an unexpected response.' };
    }
    if (error.kind === 'aborted') {
      return { kind: 'other', message: 'The request was cancelled.' };
    }
  }
  return {
    kind: 'other',
    message: error instanceof Error ? error.message : 'Failed to load the case.',
  };
}

export const fetchReviewCase = createAsyncThunk<CaseView, string, { rejectValue: CaseErrorInfo }>(
  'case/fetch',
  async (reviewRef, { signal, rejectWithValue }) => {
    try {
      return await getReviewCase(reviewRef, signal);
    } catch (error) {
      return rejectWithValue(classify(error));
    }
  },
);

/** Human-friendly message for a decision-submission failure. */
function submissionMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'http') {
      if (error.status === 401 || error.status === 403) {
        return 'Not authorised to record a decision. Check the reviewer token.';
      }
      if (error.status === 404) {
        return 'This review no longer exists.';
      }
      if (error.status === 409) {
        // Backend uses 409 for both transcript_pending and already_decided.
        return error.message === 'already_decided'
          ? 'A decision has already been recorded for this case.'
          : 'Waiting on the verified transcript before a decision can be recorded.';
      }
      return error.message || `Request failed with status ${error.status ?? 'unknown'}.`;
    }
    if (error.kind === 'network') return "Couldn't reach the review service. Check your connection and try again.";
    if (error.kind === 'timeout') return 'The review service took too long to respond. Try again in a moment.';
    if (error.kind === 'parse') return 'The review service returned an unexpected response.';
    if (error.kind === 'aborted') return 'The submission was cancelled.';
  }
  return error instanceof Error ? error.message : 'Failed to record the decision.';
}

export interface SubmitDecisionArgs {
  reviewRef: string;
  body: DecisionRequest;
}

export const submitDecision = createAsyncThunk<
  DecisionResponse & { reviewRef: string; decision: string },
  SubmitDecisionArgs,
  { state: RootState; rejectValue: string }
>(
  'case/submitDecision',
  async ({ reviewRef, body }, { signal, rejectWithValue }) => {
    try {
      const response = await postReviewDecision(reviewRef, body, signal);
      return { ...response, reviewRef, decision: response.decision ?? body.decision };
    } catch (error) {
      return rejectWithValue(submissionMessage(error));
    }
  },
  {
    // Block duplicate submits while one is already in flight.
    condition: (_, { getState }) => getState().case.submission.status !== 'submitting',
  },
);

const caseSlice = createSlice({
  name: 'case',
  initialState,
  reducers: {
    /** Clears any loaded case; used when the URL leaves a specific case. */
    caseCleared(state) {
      state.currentRef = null;
      state.status = 'idle';
      state.data = null;
      state.error = null;
      state.submission = initialSubmission;
    },
    /** Clears a failed submission so the specialist can retry from a clean state. */
    submissionErrorDismissed(state) {
      if (state.submission.status === 'failed') {
        state.submission.status = 'idle';
        state.submission.error = null;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReviewCase.pending, (state, action) => {
        state.status = 'loading';
        state.currentRef = action.meta.arg;
        state.error = null;
        // Reset the submission whenever a different case starts loading,
        // so an old success/failure doesn't bleed onto the new panel.
        if (state.submission.reviewRef !== action.meta.arg) {
          state.submission = initialSubmission;
        }
      })
      .addCase(fetchReviewCase.fulfilled, (state, action: PayloadAction<CaseView>) => {
        state.status = 'succeeded';
        state.data = action.payload;
        state.currentRef = action.payload.reviewRef;
        state.error = null;
      })
      .addCase(fetchReviewCase.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          action.payload ??
          ({ kind: 'other', message: action.error.message ?? 'Failed to load the case.' } as CaseErrorInfo);
        state.data = null;
      })
      .addCase(submitDecision.pending, (state, action) => {
        state.submission.status = 'submitting';
        state.submission.error = null;
        state.submission.reviewRef = action.meta.arg.reviewRef;
      })
      .addCase(submitDecision.fulfilled, (state, action) => {
        state.submission.status = 'succeeded';
        state.submission.decision = action.payload.decision;
        state.submission.reviewRef = action.payload.reviewRef;
        state.submission.error = null;
      })
      .addCase(submitDecision.rejected, (state, action) => {
        state.submission.status = 'failed';
        state.submission.error = action.payload ?? action.error.message ?? 'Failed to record the decision.';
      });
  },
});

export const { caseCleared, submissionErrorDismissed } = caseSlice.actions;
export const caseReducer = caseSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectCaseStatus = (state: RootState) => state.case.status;
export const selectCase = (state: RootState) => state.case.data;
export const selectCaseError = (state: RootState) => state.case.error;
export const selectCurrentCaseRef = (state: RootState) => state.case.currentRef;
export const selectDecisionSubmission = (state: RootState) => state.case.submission;
