import { configureStore, type Action, type ThunkAction } from '@reduxjs/toolkit';
import { callSessionReducer } from '@/features/caller/state/callSessionSlice';
import { caseReducer } from '@/features/specialist/state/caseSlice';
import { reviewQueueReducer } from '@/features/specialist/state/reviewQueueSlice';

// configureStore includes the redux-thunk middleware by default.
export const store = configureStore({
  reducer: {
    callSession: callSessionReducer,
    reviewQueue: reviewQueueReducer,
    case: caseReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, Action>;
