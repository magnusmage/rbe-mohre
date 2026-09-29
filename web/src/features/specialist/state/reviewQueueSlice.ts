import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import { ApiError } from '@/services/http/apiClient';
import { getReviewQueue, type QueueCase } from '@/services/review/reviewApi';
import type { Tier } from '@/types';

export type QueueStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface ReviewQueueState {
  status: QueueStatus;
  items: QueueCase[];
  error: string | null;
}

const initialState: ReviewQueueState = {
  status: 'idle',
  items: [],
  error: null,
};

/** Human-facing error message per ApiError kind. */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'network':
        return "Couldn't reach the review service. Check your connection and try again.";
      case 'timeout':
        return 'The review service took too long to respond. Try again in a moment.';
      case 'aborted':
        return 'The request was cancelled.';
      case 'parse':
        return 'The review service returned an unexpected response.';
      case 'http':
        if (error.status === 401 || error.status === 403) {
          return 'Not authorised to load the review queue. Check the reviewer token.';
        }
        return error.message || `Request failed with status ${error.status ?? 'unknown'}.`;
    }
  }
  return error instanceof Error ? error.message : 'Failed to load the review queue.';
}

export const fetchReviewQueue = createAsyncThunk<QueueCase[], void, { rejectValue: string }>(
  'reviewQueue/fetch',
  async (_, { signal, rejectWithValue }) => {
    try {
      return await getReviewQueue(signal);
    } catch (error) {
      return rejectWithValue(messageFor(error));
    }
  },
);

const reviewQueueSlice = createSlice({
  name: 'reviewQueue',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchReviewQueue.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchReviewQueue.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
        state.error = null;
      })
      .addCase(fetchReviewQueue.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? action.error.message ?? 'Failed to load the review queue.';
      });
  },
});

export const reviewQueueReducer = reviewQueueSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectReviewQueueStatus = (state: RootState) => state.reviewQueue.status;
export const selectReviewQueueItems = (state: RootState) => state.reviewQueue.items;
export const selectReviewQueueError = (state: RootState) => state.reviewQueue.error;

/**
 * Open-case totals per tier and overall, derived from the loaded queue.
 * Memoised so React-Redux doesn't warn about a new object per call.
 */
export const selectReviewQueueTotals = createSelector(
  [selectReviewQueueItems],
  (items): { all: number; T2: number; T1: number; T0: number } => {
    const totals = { all: 0, T2: 0, T1: 0, T0: 0 };
    for (const item of items) {
      totals.all += 1;
      totals[item.tier as Tier] += 1;
    }
    return totals;
  },
);
