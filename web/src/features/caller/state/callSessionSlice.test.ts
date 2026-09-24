import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallError } from './callErrors';
import {
  callErrorDismissed,
  callSessionReducer,
  agentErrorDismissed,
  endCall,
  fetchSignedUrl,
  isCallActive,
  isStartInProgress,
  selectAgentError,
  selectAgentMode,
  selectCallDurationSeconds,
  selectCallError,
  selectCallStartedAt,
  selectCallStatus,
  selectIsCallActive,
  selectIsEndingCall,
  selectIsStartingCall,
  selectMuted,
  startCall,
  type CallSessionState,
  type CallStatus,
} from './callSessionSlice';

/**
 * Internal actions are addressed by type: they are dispatched by the thunk, not exported,
 * and keeping them private avoids widening the slice's public API just for tests.
 */
const internal = {
  statusChanged: (payload: CallStatus) => ({ type: 'callSession/statusChanged', payload }),
  agentModeChanged: (payload: 'speaking' | 'listening') => ({ type: 'callSession/agentModeChanged', payload }),
  agentStatusChanged: (payload: string) => ({ type: 'callSession/agentStatusChanged', payload }),
  agentErrorReported: (payload: string) => ({ type: 'callSession/agentErrorReported', payload }),
  mutedChanged: (payload: boolean) => ({ type: 'callSession/mutedChanged', payload }),
  sessionDisconnected: (payload: unknown) => ({ type: 'callSession/sessionDisconnected', payload }),
};

const initial = callSessionReducer(undefined, { type: '@@init' });
const reduce = (state: CallSessionState, ...actions: { type: string; payload?: unknown }[]) =>
  actions.reduce((acc, action) => callSessionReducer(acc, action), state);

/** State as it is right after `startCall` succeeds. */
function connected(overrides: Partial<CallSessionState> = {}): CallSessionState {
  const state = reduce(initial, startCall.pending('req-1'), startCall.fulfilled('conv_1', 'req-1'));
  return { ...state, ...overrides };
}

const CALL_ERROR: CallError = { source: 'api', title: 'nope', message: 'nope' };

describe('callSession status helpers', () => {
  it('knows which statuses count as a start in progress', () => {
    expect(isStartInProgress('requesting-microphone')).toBe(true);
    expect(isStartInProgress('fetching-session')).toBe(true);
    expect(isStartInProgress('connecting')).toBe(true);
    expect(isStartInProgress('connected')).toBe(false);
    expect(isStartInProgress('idle')).toBe(false);
  });

  it('counts connected and ending as an active call', () => {
    expect(isCallActive('connected')).toBe(true);
    expect(isCallActive('ending')).toBe(true);
    expect(isCallActive('ended')).toBe(false);
    expect(isCallActive('connecting')).toBe(false);
  });
});

describe('callSession reducer — start flow', () => {
  it('starts idle with no timer or session', () => {
    expect(initial.status).toBe('idle');
    expect(initial.startedAt).toBeNull();
    expect(initial.durationSeconds).toBeNull();
    expect(initial.conversationId).toBeNull();
  });

  it('moves through the start phases', () => {
    const state = reduce(
      initial,
      startCall.pending('r'),
      internal.statusChanged('fetching-session'),
      internal.statusChanged('connecting'),
    );
    expect(state.status).toBe('connecting');
  });

  it('keeps a previous error visible until the retry makes progress', () => {
    const failed = reduce(initial, startCall.pending('r'), startCall.rejected(null, 'r', undefined, CALL_ERROR));
    expect(failed.error).toEqual(CALL_ERROR);

    const retrying = callSessionReducer(failed, startCall.pending('r2'));
    expect(retrying.error).toEqual(CALL_ERROR);

    const progressed = callSessionReducer(retrying, internal.statusChanged('fetching-session'));
    expect(progressed.error).toBeNull();
  });

  it('records the conversation and starts the timer on connect', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    const state = connected();
    expect(state.status).toBe('connected');
    expect(state.conversationId).toBe('conv_1');
    expect(state.startedAt).toBe(Date.parse('2026-09-24T10:00:00Z'));
    expect(state.durationSeconds).toBeNull();
    vi.useRealTimers();
  });

  it('clears timer state when the start fails', () => {
    const state = reduce(initial, startCall.pending('r'), startCall.rejected(null, 'r', undefined, CALL_ERROR));
    expect(state.status).toBe('failed');
    expect(state.error).toEqual(CALL_ERROR);
    expect(state.startedAt).toBeNull();
    expect(state.durationSeconds).toBeNull();
  });

  it('falls back to a connection error when the thunk threw without a payload', () => {
    const state = reduce(initial, startCall.pending('r'), startCall.rejected(new Error('boom'), 'r'));
    expect(state.status).toBe('failed');
    expect(state.error?.source).toBe('connection');
  });

  it('resets per-call state on a new attempt', () => {
    const state = reduce(
      connected({ muted: true, agentMode: 'speaking', agentError: 'glitch' }),
      startCall.pending('r2'),
    );
    expect(state.conversationId).toBeNull();
    expect(state.muted).toBe(false);
    expect(state.agentMode).toBe('listening');
    expect(state.agentError).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.durationSeconds).toBeNull();
  });
});

describe('callSession reducer — signed URL request', () => {
  it('tracks idle → loading → succeeded', () => {
    expect(initial.signedUrlRequest).toEqual({ status: 'idle', error: null });
    const loading = callSessionReducer(initial, fetchSignedUrl.pending('r'));
    expect(loading.signedUrlRequest.status).toBe('loading');
    const done = callSessionReducer(loading, fetchSignedUrl.fulfilled('wss://x', 'r'));
    expect(done.signedUrlRequest).toEqual({ status: 'succeeded', error: null });
  });

  it('records the rejection message on failure', () => {
    const state = reduce(initial, fetchSignedUrl.pending('r'), fetchSignedUrl.rejected(null, 'r', undefined, CALL_ERROR));
    expect(state.signedUrlRequest).toEqual({ status: 'failed', error: CALL_ERROR.message });
  });

  it('falls back to the raw error message when there is no payload', () => {
    const state = callSessionReducer(initial, fetchSignedUrl.rejected(new Error('offline'), 'r'));
    expect(state.signedUrlRequest.error).toBe('offline');
  });
});

describe('callSession reducer — live call events', () => {
  it('tracks agent mode, SDK status and mute', () => {
    const state = reduce(
      connected(),
      internal.agentModeChanged('speaking'),
      internal.agentStatusChanged('disconnecting'),
      internal.mutedChanged(true),
    );
    expect(state.agentMode).toBe('speaking');
    expect(state.agentStatus).toBe('disconnecting');
    expect(state.muted).toBe(true);
  });

  it('keeps a non-fatal SDK error while the call is active and allows dismissing it', () => {
    const reported = callSessionReducer(connected(), internal.agentErrorReported('audio glitch'));
    expect(reported.agentError).toBe('audio glitch');
    expect(reported.status).toBe('connected');
    expect(callSessionReducer(reported, agentErrorDismissed()).agentError).toBeNull();
  });

  it('ignores SDK errors reported when no call is active', () => {
    expect(callSessionReducer(initial, internal.agentErrorReported('late')).agentError).toBeNull();
  });

  it('allows dismissing the call error', () => {
    const failed = reduce(initial, startCall.pending('r'), startCall.rejected(null, 'r', undefined, CALL_ERROR));
    expect(callSessionReducer(failed, callErrorDismissed()).error).toBeNull();
  });
});

describe('callSession reducer — disconnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('treats an agent hang-up as a completed call and freezes the duration', () => {
    const live = connected();
    vi.setSystemTime(new Date('2026-09-24T10:00:07Z'));
    const state = callSessionReducer(live, internal.sessionDisconnected({ reason: 'agent' }));
    expect(state.status).toBe('ended');
    expect(state.durationSeconds).toBe(7);
    expect(state.conversationId).toBeNull();
    expect(state.agentStatus).toBe('disconnected');
    expect(state.muted).toBe(false);
  });

  it('treats a user-side disconnect as a completed call', () => {
    const state = callSessionReducer(connected(), internal.sessionDisconnected({ reason: 'user' }));
    expect(state.status).toBe('ended');
  });

  it('reports an unexpected drop as a failure with a user-facing error', () => {
    const state = callSessionReducer(
      connected(),
      internal.sessionDisconnected({ reason: 'error', message: 'socket closed', context: {} }),
    );
    expect(state.status).toBe('failed');
    expect(state.error?.title).toBe('Call disconnected');
    expect(state.durationSeconds).not.toBeNull();
  });

  it('treats an error disconnect during our own teardown as a normal end', () => {
    const ending = reduce(connected(), endCall.pending('r'));
    expect(ending.status).toBe('ending');
    const state = callSessionReducer(
      ending,
      internal.sessionDisconnected({ reason: 'error', message: 'closed', context: {} }),
    );
    expect(state.status).toBe('ended');
    expect(state.error).toBeNull();
  });

  it('ignores a disconnect when no call is active', () => {
    const state = callSessionReducer(initial, internal.sessionDisconnected({ reason: 'agent' }));
    expect(state).toEqual(initial);
  });

  it('does not recompute a duration that is already frozen', () => {
    const live = connected();
    vi.setSystemTime(new Date('2026-09-24T10:00:05Z'));
    const ended = callSessionReducer(live, internal.sessionDisconnected({ reason: 'agent' }));
    vi.setSystemTime(new Date('2026-09-24T10:05:00Z'));
    const again = callSessionReducer(ended, endCall.fulfilled(undefined, 'r'));
    expect(again.durationSeconds).toBe(5);
  });
});

describe('callSession reducer — ending', () => {
  it('marks the call as ending only from connected', () => {
    expect(callSessionReducer(connected(), endCall.pending('r')).status).toBe('ending');
    expect(callSessionReducer(initial, endCall.pending('r')).status).toBe('idle');
  });

  it('finalises the call when teardown resolves', () => {
    const state = reduce(connected(), endCall.pending('r'), endCall.fulfilled(undefined, 'r'));
    expect(state.status).toBe('ended');
    expect(state.durationSeconds).not.toBeNull();
  });

  it('finalises the call even if teardown rejects', () => {
    const state = reduce(connected(), endCall.pending('r'), endCall.rejected(new Error('sdk blew up'), 'r'));
    expect(state.status).toBe('ended');
  });

  it('is idempotent when the SDK disconnect and the thunk both land', () => {
    const state = reduce(
      connected(),
      endCall.pending('r'),
      { type: 'callSession/sessionDisconnected', payload: { reason: 'user' } },
      endCall.fulfilled(undefined, 'r'),
    );
    expect(state.status).toBe('ended');
    expect(state.conversationId).toBeNull();
  });
});

describe('callSession selectors', () => {
  const asRoot = (callSession: CallSessionState) => ({ callSession });

  it('expose the pieces screens need', () => {
    const state = asRoot(connected({ muted: true, agentMode: 'speaking', agentError: 'glitch' }));
    expect(selectCallStatus(state)).toBe('connected');
    expect(selectMuted(state)).toBe(true);
    expect(selectAgentMode(state)).toBe('speaking');
    expect(selectAgentError(state)).toBe('glitch');
    expect(selectIsCallActive(state)).toBe(true);
    expect(selectIsStartingCall(state)).toBe(false);
    expect(selectCallStartedAt(state)).toBe(state.callSession.startedAt);
    expect(selectCallDurationSeconds(state)).toBeNull();
    expect(selectCallError(state)).toBeNull();
  });

  it('reports ending while tearing down or while the SDK is disconnecting', () => {
    expect(selectIsEndingCall(asRoot(connected({ status: 'ending' })))).toBe(true);
    expect(selectIsEndingCall(asRoot(connected({ agentStatus: 'disconnecting' })))).toBe(true);
    expect(selectIsEndingCall(asRoot(connected()))).toBe(false);
  });
});
