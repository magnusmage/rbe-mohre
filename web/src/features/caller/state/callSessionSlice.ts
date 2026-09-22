import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { DisconnectionDetails } from '@elevenlabs/client';
import type { AppThunk, RootState } from '@/store';
import { ensureMicrophoneAccess } from '@/services/media/microphone';
import { getSignedUrl } from '@/services/session/sessionApi';
import { voiceAgent, type AgentMode } from '@/services/voice/voiceAgent';
import {
  apiError,
  connectionError,
  droppedCallError,
  microphoneError,
  type CallError,
} from './callErrors';

export type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type CallStatus =
  | 'idle'
  | 'requesting-microphone'
  | 'fetching-session'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'failed';

export interface CallSessionState {
  status: CallStatus;
  error: CallError | null;
  conversationId: string | null;
  agentMode: AgentMode;
  muted: boolean;
  /**
   * State of `GET /session/signed-url`. The URL itself is short-lived and single-use,
   * so it is handed straight to the voice agent rather than kept in the store.
   */
  signedUrlRequest: { status: RequestStatus; error: string | null };
}

const initialState: CallSessionState = {
  status: 'idle',
  error: null,
  conversationId: null,
  agentMode: 'listening',
  muted: false,
  signedUrlRequest: { status: 'idle', error: null },
};

const START_IN_PROGRESS: ReadonlySet<CallStatus> = new Set(['requesting-microphone', 'fetching-session', 'connecting']);

export const isStartInProgress = (status: CallStatus) => START_IN_PROGRESS.has(status);

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

/** `GET /session/signed-url`; rejects with a user-facing error. */
export const fetchSignedUrl = createAsyncThunk<string, void, { rejectValue: CallError }>(
  'callSession/fetchSignedUrl',
  async (_, { signal, rejectWithValue }) => {
    try {
      return await getSignedUrl(signal);
    } catch (error) {
      return rejectWithValue(apiError(error));
    }
  },
);

/**
 * Start Call flow: microphone permission -> signed URL -> ElevenLabs connection.
 * Resolves with the conversation id once the voice session is live.
 */
export const startCall = createAsyncThunk<string, void, { state: RootState; rejectValue: CallError }>(
  'callSession/startCall',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      await ensureMicrophoneAccess();
    } catch (error) {
      return rejectWithValue(microphoneError(error));
    }

    dispatch(callSessionSlice.actions.statusChanged('fetching-session'));
    const result = await dispatch(fetchSignedUrl());
    if (fetchSignedUrl.rejected.match(result)) {
      return rejectWithValue(result.payload ?? apiError(result.error));
    }

    dispatch(callSessionSlice.actions.statusChanged('connecting'));
    try {
      return await voiceAgent.connect(result.payload, {
        onModeChange: (mode) => dispatch(callSessionSlice.actions.agentModeChanged(mode)),
        onDisconnect: (details) => dispatch(callSessionSlice.actions.sessionDisconnected(details)),
      });
    } catch (error) {
      return rejectWithValue(connectionError(error));
    }
  },
  {
    // Blocks duplicate Start Call actions while one is already in flight.
    condition: (_, { getState }) => !isStartInProgress(getState().callSession.status),
  },
);

/** Ends the live voice session (no-op if none). */
export const endCall = createAsyncThunk('callSession/endCall', () => voiceAgent.end());

export const setMicrophoneMuted =
  (muted: boolean): AppThunk =>
  (dispatch) => {
    voiceAgent.setMuted(muted);
    dispatch(callSessionSlice.actions.mutedChanged(muted));
  };

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const callSessionSlice = createSlice({
  name: 'callSession',
  initialState,
  reducers: {
    statusChanged(state, action: PayloadAction<CallStatus>) {
      state.status = action.payload;
      // The attempt got past the step that failed before, so the old error is stale.
      state.error = null;
    },
    agentModeChanged(state, action: PayloadAction<AgentMode>) {
      state.agentMode = action.payload;
    },
    mutedChanged(state, action: PayloadAction<boolean>) {
      state.muted = action.payload;
    },
    sessionDisconnected(state, action: PayloadAction<DisconnectionDetails>) {
      // Failures while still connecting are reported through startCall.rejected.
      if (state.status !== 'connected') return;
      const details = action.payload;
      state.muted = false;
      if (details.reason === 'error') {
        state.status = 'failed';
        state.error = droppedCallError(details);
      } else {
        state.status = 'ended';
      }
    },
    callErrorDismissed(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSignedUrl.pending, (state) => {
        state.signedUrlRequest = { status: 'loading', error: null };
      })
      .addCase(fetchSignedUrl.fulfilled, (state) => {
        state.signedUrlRequest = { status: 'succeeded', error: null };
      })
      .addCase(fetchSignedUrl.rejected, (state, action) => {
        state.signedUrlRequest = { status: 'failed', error: action.payload?.message ?? action.error.message ?? null };
      })
      .addCase(startCall.pending, (state) => {
        state.status = 'requesting-microphone';
        // Keep any previous error visible until this attempt progresses or finishes,
        // so a retry that fails instantly doesn't make the message flicker.
        state.conversationId = null;
        state.agentMode = 'listening';
        state.muted = false;
      })
      .addCase(startCall.fulfilled, (state, action) => {
        state.status = 'connected';
        state.error = null;
        state.conversationId = action.payload;
      })
      .addCase(startCall.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? connectionError(action.error);
      })
      .addCase(endCall.fulfilled, (state) => {
        if (state.status === 'connected') state.status = 'ended';
        state.muted = false;
      });
  },
});

export const { callErrorDismissed } = callSessionSlice.actions;
export const callSessionReducer = callSessionSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectCallStatus = (state: RootState) => state.callSession.status;
export const selectCallError = (state: RootState) => state.callSession.error;
export const selectAgentMode = (state: RootState) => state.callSession.agentMode;
export const selectMuted = (state: RootState) => state.callSession.muted;
export const selectIsStartingCall = (state: RootState) => isStartInProgress(state.callSession.status);
