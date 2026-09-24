import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/app/routes';
import { voiceAgent } from '@/services/voice/voiceAgent';
import { connectedCallSession, makeStore, renderWithProviders, selectCallSession, type TestStore } from '@/test/utils';
import type { CallSessionState } from '../state/callSessionSlice';
import { InCallScreen } from './InCallScreen';

vi.mock('@/services/voice/voiceAgent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/voice/voiceAgent')>()),
  // MOCK: the ElevenLabs session itself is covered by voiceAgent.test.ts.
  voiceAgent: { connect: vi.fn(async () => 'conv_1'), end: vi.fn(async () => {}), setMuted: vi.fn() },
}));

const endMock = vi.mocked(voiceAgent.end);
const setMutedMock = vi.mocked(voiceAgent.setMuted);

const START = Date.parse('2026-09-24T10:00:00Z');

/** Fires an SDK disconnect the way the voice agent would. */
const disconnect = (store: TestStore, payload: unknown) =>
  store.dispatch({ type: 'callSession/sessionDisconnected', payload });

function renderCall(state: Partial<CallSessionState> = connectedCallSession()) {
  const store = makeStore(state);
  return renderWithProviders(<InCallScreen />, {
    store,
    route: ROUTES.callerCall,
    extraRoutes: [
      { path: ROUTES.callerEnded, element: <div>call ended screen</div> },
      { path: ROUTES.callerReady, element: <div>start call screen</div> },
    ],
  });
}

beforeEach(() => {
  endMock.mockResolvedValue(undefined);
});

/**
 * Fake timers are confined to the timer tests: RTL's `waitFor` polls on real timers,
 * so faking them globally would hang every interaction test.
 */
describe('InCallScreen — timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  const renderLiveCall = () => renderCall(connectedCallSession({ startedAt: START }));

  it('starts the displayed timer at the moment the call connected', () => {
    renderLiveCall();
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
  });

  it('advances the timer every second while the call is live', async () => {
    renderLiveCall();

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:01');

    await act(() => vi.advanceTimersByTimeAsync(64_000));
    expect(screen.getByRole('timer')).toHaveTextContent('01:05');
  });

  it('freezes the timer once the call has ended', async () => {
    const { store } = renderLiveCall();
    await act(() => vi.advanceTimersByTimeAsync(3000));

    act(() => void disconnect(store, { reason: 'agent' }));
    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(selectCallSession(store).durationSeconds).toBe(3);
  });

  it('leaves no interval behind when the screen unmounts', async () => {
    const { unmount } = renderLiveCall();
    await act(() => vi.advanceTimersByTimeAsync(1000));

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('InCallScreen — ending the call', () => {
  it('closes the session and moves to the Call ended screen', async () => {
    const { user, location } = renderCall();

    await user.click(screen.getByRole('button', { name: /end call/i }));

    expect(endMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(location()).toBe(ROUTES.callerEnded));
  });

  it('shows an ending state and refuses a second press', async () => {
    let release: () => void = () => {};
    endMock.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    const { user } = renderCall();

    await user.click(screen.getByRole('button', { name: /end call/i }));

    const endingButton = await screen.findByRole('button', { name: /ending/i });
    expect(endingButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /transfer to human/i })).toBeDisabled();

    await user.click(endingButton);
    expect(endMock).toHaveBeenCalledTimes(1);

    release();
  });

  it('ends the call when the caller asks for a human', async () => {
    const { user, location } = renderCall();

    await user.click(screen.getByRole('button', { name: /transfer to human/i }));

    expect(endMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(location()).toBe(ROUTES.callerEnded));
  });
});

describe('InCallScreen — session events', () => {
  it('moves to the Call ended screen when the agent hangs up', async () => {
    const { store, location } = renderCall();

    disconnect(store, { reason: 'agent' });

    await waitFor(() => expect(location()).toBe(ROUTES.callerEnded));
  });

  it('returns to Start call when the connection drops unexpectedly', async () => {
    const { store, location } = renderCall();

    disconnect(store, { reason: 'error', message: 'socket closed', context: {} });

    await waitFor(() => expect(location()).toBe(ROUTES.callerReady));
    expect(selectCallSession(store).error?.title).toBe('Call disconnected');
  });

  it('reports a non-fatal agent problem without ending the call', async () => {
    const { store, user } = renderCall();

    store.dispatch({ type: 'callSession/agentErrorReported', payload: 'audio glitch' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('audio glitch');
    expect(selectCallSession(store).status).toBe('connected');

    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows what the agent is doing, and mute instead while muted', async () => {
    const { store, user } = renderCall();
    store.dispatch({ type: 'callSession/agentModeChanged', payload: 'speaking' });
    expect(await screen.findByText('Agent speaking')).toBeInTheDocument();

    store.dispatch({ type: 'callSession/agentModeChanged', payload: 'listening' });
    expect(await screen.findByText('Listening')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mute microphone/i }));
    expect(setMutedMock).toHaveBeenCalledWith(true);
    expect(await screen.findByText('Microphone muted')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /unmute microphone/i }));
    expect(setMutedMock).toHaveBeenLastCalledWith(false);
  });
});

describe('InCallScreen — leaving', () => {
  it('asks for confirmation before leaving a live call', async () => {
    const { user, location } = renderCall();

    await user.click(screen.getByRole('link', { name: 'Back' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Are you sure you want to leave? The call will end.');
    expect(location()).toBe(ROUTES.callerCall);
    expect(endMock).not.toHaveBeenCalled();
  });

  it('stays on the call when the caller cancels', async () => {
    const { user, location } = renderCall();
    await user.click(screen.getByRole('link', { name: 'Back' }));

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(location()).toBe(ROUTES.callerCall);
    expect(endMock).not.toHaveBeenCalled();
  });

  it('ends the call and continues to the requested screen on confirmation', async () => {
    const { user, location, store } = renderCall();
    await user.click(screen.getByRole('link', { name: 'Back' }));

    await user.click(screen.getByRole('button', { name: /yes, end the call/i }));

    expect(endMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(location()).toBe(ROUTES.callerReady));
    expect(selectCallSession(store).status).toBe('ended');
  });

  it('releases the caller if the call ends while the confirmation is open', async () => {
    const { user, store, location } = renderCall();
    await user.click(screen.getByRole('link', { name: 'Back' }));

    // The agent hangs up before the caller answers the question.
    disconnect(store, { reason: 'agent' });

    // The confirmation is moot: it closes and the normal end-of-call flow continues.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(location()).toBe(ROUTES.callerEnded));
  });
});

describe('InCallScreen — no live session', () => {
  it('redirects to Start call on a direct visit or after a refresh', async () => {
    const { location } = renderCall({});

    await waitFor(() => expect(location()).toBe(ROUTES.callerReady));
    expect(screen.getByText('start call screen')).toBeInTheDocument();
  });

  it('does not ask for confirmation when there is nothing to end', async () => {
    const { location } = renderCall({});

    await waitFor(() => expect(location()).toBe(ROUTES.callerReady));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(endMock).not.toHaveBeenCalled();
  });
});
