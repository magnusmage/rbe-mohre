import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import { ApiError } from '@/services/http/apiClient';
import { getReviewCase, type CaseView } from '@/services/review/reviewApi';

export type CaseStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type CaseErrorKind = 'not-found' | 'unauthorised' | 'other';

export interface CaseErrorInfo {
  kind: CaseErrorKind;
  message: string;
}

export interface CaseState {
  /** Ref of the case currently loaded or being loaded (or last requested). */
  currentRef: string | null;
  status: CaseStatus;
  data: CaseView | null;
  error: CaseErrorInfo | null;
}

const initialState: CaseState = {
  currentRef: null,
  status: 'idle',
  data: null,
  error: null,
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
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReviewCase.pending, (state, action) => {
        state.status = 'loading';
        state.currentRef = action.meta.arg;
        state.error = null;
        // Keep the previous `data` visible for a soft transition; the screen
        // gates on `status === 'loading' || currentRef !== data.reviewRef`.
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
      });
  },
});

export const { caseCleared } = caseSlice.actions;
export const caseReducer = caseSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectCaseStatus = (state: RootState) => state.case.status;
export const selectCase = (state: RootState) => state.case.data;
export const selectCaseError = (state: RootState) => state.case.error;
export const selectCurrentCaseRef = (state: RootState) => state.case.currentRef;
