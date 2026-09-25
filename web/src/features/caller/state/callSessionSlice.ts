import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { DisconnectionDetails } from '@elevenlabs/client';
import type { AppThunk, RootState } from '@/store';
import { ensureMicrophoneAccess } from '@/services/media/microphone';
import { getSignedUrl } from '@/services/session/sessionApi';
import { voiceAgent, type AgentConnectionStatus, type AgentMode } from '@/services/voice/voiceAgent';
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
  | 'ending'
  | 'ended'
  | 'failed';

export interface CallSessionState {
  status: CallStatus;
  error: CallError | null;
  conversationId: string | null;
  agentMode: AgentMode;
  /** Raw SDK connection status, kept in sync with the live session. */
  agentStatus: AgentConnectionStatus;
  /** Non-fatal SDK error reported during a call. */
  agentError: string | null;
  muted: boolean;
  /** Epoch ms the call connected; drives the live timer. */
  startedAt: number | null;
  /** Final duration, preserved for the Call ended screen. */
  durationSeconds: number | null;
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
  agentStatus: 'disconnected',
  agentError: null,
  muted: false,
  startedAt: null,
  durationSeconds: null,
  signedUrlRequest: { status: 'idle', error: null },
};

const START_IN_PROGRESS: ReadonlySet<CallStatus> = new Set(['requesting-microphone', 'fetching-session', 'connecting']);

export const isStartInProgress = (status: CallStatus) => START_IN_PROGRESS.has(status);

/** A live session exists (or is being torn down) and owns the microphone. */
export const isCallActive = (status: CallStatus) => status === 'connected' || status === 'ending';

/** Freezes the timer and clears per-call runtime state. Safe to run more than once. */
function finishCall(state: CallSessionState, status: 'ended' | 'failed', error: CallError | null = null) {
  if (state.durationSeconds === null) {
    state.durationSeconds = state.startedAt === null ? 0 : Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
  }
  state.status = status;
  state.error = error;
  state.agentMode = 'listening';
  state.agentStatus = 'disconnected';
  state.agentError = null;
  state.muted = false;
  state.conversationId = null;
}

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
        onError: (message) => dispatch(callSessionSlice.actions.agentErrorReported(message)),
        onStatusChange: (status) => dispatch(callSessionSlice.actions.agentStatusChanged(status)),
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

/**
 * Ends the live voice session and releases its microphone/audio resources.
 * Idempotent: `voiceAgent.end()` is a no-op without a session, and the thunk
 * condition blocks a second end while one is running.
 */
export const endCall = createAsyncThunk<void, void, { state: RootState }>(
  'callSession/endCall',
  () => voiceAgent.end(),
  { condition: (_, { getState }) => getState().callSession.status !== 'ending' },
);

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
    agentStatusChanged(state, action: PayloadAction<AgentConnectionStatus>) {
      state.agentStatus = action.payload;
    },
    agentErrorReported(state, action: PayloadAction<string>) {
      if (isCallActive(state.status)) state.agentError = action.payload;
    },
    agentErrorDismissed(state) {
      state.agentError = null;
    },
    mutedChanged(state, action: PayloadAction<boolean>) {
      state.muted = action.payload;
    },
    /** SDK `onDisconnect`: agent hang-up, user end, or an unexpected drop. */
    sessionDisconnected(state, action: PayloadAction<DisconnectionDetails>) {
      // Failures while still connecting are reported through startCall.rejected.
      if (!isCallActive(state.status)) return;
      const details = action.payload;
      // A drop while we are already ending is the expected result of our own endSession().
      if (details.reason === 'error' && state.status === 'connected') {
        finishCall(state, 'failed', droppedCallError(details));
      } else {
        finishCall(state, 'ended');
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
        state.agentStatus = 'connecting';
        state.agentError = null;
        state.muted = false;
        state.startedAt = null;
        state.durationSeconds = null;
      })
      .addCase(startCall.fulfilled, (state, action) => {
        state.status = 'connected';
        state.error = null;
        state.conversationId = action.payload;
        state.agentStatus = 'connected';
        // Single source of truth for the call timer.
        state.startedAt = Date.now();
        state.durationSeconds = null;
      })
      .addCase(startCall.rejected, (state, action) => {
        finishCall(state, 'failed', action.payload ?? connectionError(action.error));
        state.startedAt = null;
        state.durationSeconds = null;
      })
      .addCase(endCall.pending, (state) => {
        if (state.status === 'connected') state.status = 'ending';
      })
      .addCase(endCall.fulfilled, (state) => {
        // sessionDisconnected usually lands first; finishCall is idempotent either way.
        if (isCallActive(state.status)) finishCall(state, 'ended');
      })
      .addCase(endCall.rejected, (state) => {
        // Cleanup failed on the SDK side; treat the call as over regardless.
        if (isCallActive(state.status)) finishCall(state, 'ended');
      });
  },
});

export const { agentErrorDismissed, callErrorDismissed } = callSessionSlice.actions;
export const callSessionReducer = callSessionSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectCallStatus = (state: RootState) => state.callSession.status;
export const selectCallError = (state: RootState) => state.callSession.error;
export const selectAgentMode = (state: RootState) => state.callSession.agentMode;
export const selectAgentError = (state: RootState) => state.callSession.agentError;
export const selectMuted = (state: RootState) => state.callSession.muted;
export const selectIsStartingCall = (state: RootState) => isStartInProgress(state.callSession.status);
export const selectIsCallActive = (state: RootState) => isCallActive(state.callSession.status);
export const selectIsEndingCall = (state: RootState) =>
  state.callSession.status === 'ending' || state.callSession.agentStatus === 'disconnecting';
export const selectCallStartedAt = (state: RootState) => state.callSession.startedAt;
export const selectCallDurationSeconds = (state: RootState) => state.callSession.durationSeconds;
