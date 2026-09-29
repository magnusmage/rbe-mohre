import { configureStore, type Action, type ThunkAction } from '@reduxjs/toolkit';
import { callSessionReducer } from '@/features/caller/state/callSessionSlice';
import { caseReducer } from '@/features/specialist/state/caseSlice';
import { reviewQueueReducer } from '@/features/specialist/state/reviewQueueSlice';
import {
  reviewerTokenRejected,
  selectReviewerToken,
  specialistAuthReducer,
} from '@/features/specialist/state/specialistAuthSlice';
import { setReviewerTokenProvider, setUnauthorizedHandler } from '@/services/http/apiClient';

// configureStore includes the redux-thunk middleware by default.
export const store = configureStore({
  reducer: {
    callSession: callSessionReducer,
    reviewQueue: reviewQueueReducer,
    case: caseReducer,
    specialistAuth: specialistAuthReducer,
  },
});

// The HTTP layer must be able to read the current reviewer token without
// importing the store (that would loop through the slices back to here). It
// asks through these registered callbacks, which stay tight to the store.
setReviewerTokenProvider(() => selectReviewerToken(store.getState()));
setUnauthorizedHandler(() => {
  // A 401 on a reviewer endpoint means the token is no longer valid — dropping
  // it forces the sign-in modal back with an explanation, and stops queued
  // requests from firing more Authorization headers the server has already
  // rejected. Guard on the current token so we don't spam repeated rejections.
  if (selectReviewerToken(store.getState())) {
    store.dispatch(reviewerTokenRejected('The token you entered is incorrect. Please try again.'));
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, Action>;
