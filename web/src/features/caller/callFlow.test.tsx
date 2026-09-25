import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/app/routes';
import { ensureMicrophoneAccess } from '@/services/media/microphone';
import { getSignedUrl } from '@/services/session/sessionApi';
import { elevenLabs } from '@/test/mocks/elevenLabsSdk';
import { makeStore, renderRoutes, selectCallSession } from '@/test/utils';
import { CallerLayout } from './CallerLayout';
import { CallEndedScreen } from './screens/CallEndedScreen';
import { InCallScreen } from './screens/InCallScreen';
import { ReadyScreen } from './screens/ReadyScreen';

/**
 * End-to-end through the app's own store, router and voice service, with only the
 * browser-level dependencies faked: the ElevenLabs SDK, the backend and the microphone.
 */
vi.mock('@elevenlabs/client', async () => (await import('@/test/mocks/elevenLabsSdk')).sdkModuleMock());

vi.mock('@/services/media/microphone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/media/microphone')>()),
  // MOCK: jsdom cannot prompt for microphone access.
  ensureMicrophoneAccess: vi.fn(async () => {}),
}));

vi.mock('@/services/session/sessionApi', () => ({
  // MOCK: stands in for GET /session/signed-url.
  getSignedUrl: vi.fn(async () => 'wss://agent.test/socket'),
}));

const micMock = vi.mocked(ensureMicrophoneAccess);
const signedUrlMock = vi.mocked(getSignedUrl);

const routes = [
  {
    path: ROUTES.caller,
    element: <CallerLayout />,
    children: [
      { path: 'ready', element: <ReadyScreen /> },
      { path: 'call', element: <InCallScreen /> },
      { path: 'ended', element: <CallEndedScreen /> },
    ],
  },
];

const renderApp = () => renderRoutes(routes, { store: makeStore(), route: ROUTES.callerReady });

/** The router location changes before React renders, so wait on the screen itself. */
const awaitCallScreen = () => screen.findByRole('timer');
const awaitEndedScreen = () => screen.findByText(/thank you/i);
const awaitReadyScreen = () => screen.findByRole('button', { name: /start call/i });

beforeEach(() => {
  elevenLabs.reset();
  micMock.mockResolvedValue(undefined);
  signedUrlMock.mockResolvedValue('wss://agent.test/socket');
});

describe('caller call flow', () => {
  it('runs a whole call from Start to Call ended and back', async () => {
    const { user, location, store } = renderApp();

    // 1. Start the call.
    await user.click(screen.getByRole('button', { name: /start call/i }));
    expect(await awaitCallScreen()).toHaveTextContent('00:00');
    expect(location()).toBe(ROUTES.callerCall);

    expect(elevenLabs.startSession).toHaveBeenCalledTimes(1);
    expect(elevenLabs.startSession.mock.calls[0][0].signedUrl).toBe('wss://agent.test/socket');

    // 2. The agent starts speaking and the caller mutes.
    act(() => elevenLabs.last.emitMode('speaking'));
    expect(await screen.findByText('Agent speaking')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mute microphone/i }));
    expect(elevenLabs.last.micMuted).toBe(true);

    // 3. End the call; the session is closed and the caller lands on the summary.
    await user.click(screen.getByRole('button', { name: /end call/i }));

    await awaitEndedScreen();
    expect(location()).toBe(ROUTES.callerEnded);
    expect(elevenLabs.last.endSession).toHaveBeenCalledTimes(1);
    expect(elevenLabs.last.ended).toBe(true);
    expect(selectCallSession(store).status).toBe('ended');
    expect(selectCallSession(store).durationSeconds).not.toBeNull();

    // 4. Back goes to Start call, ready for another one.
    await user.click(screen.getByRole('link', { name: 'Back' }));
    await awaitReadyScreen();
    expect(location()).toBe(ROUTES.callerReady);
  });

  it('starts a fresh session for a second call without reusing the first', async () => {
    const { user, location, store } = renderApp();

    await user.click(screen.getByRole('button', { name: /start call/i }));
    await awaitCallScreen();
    const firstSession = elevenLabs.last;

    await user.click(screen.getByRole('button', { name: /end call/i }));
    await awaitEndedScreen();

    await user.click(screen.getByRole('link', { name: 'Back' }));
    await awaitReadyScreen();

    await user.click(screen.getByRole('button', { name: /start call/i }));
    await awaitCallScreen();
    expect(location()).toBe(ROUTES.callerCall);

    expect(elevenLabs.startSession).toHaveBeenCalledTimes(2);
    expect(elevenLabs.last).not.toBe(firstSession);
    const state = selectCallSession(store);
    expect(state.conversationId).toBe('conv_2');
    expect(state.durationSeconds).toBeNull();
    expect(state.muted).toBe(false);
  });

  it('takes the caller to the summary when the agent hangs up', async () => {
    const { user, location } = renderApp();
    await user.click(screen.getByRole('button', { name: /start call/i }));
    await awaitCallScreen();

    act(() => elevenLabs.last.emitDisconnect({ reason: 'agent' }));

    await awaitEndedScreen();
    expect(location()).toBe(ROUTES.callerEnded);
  });

  it('returns the caller to Start call with an explanation when the call drops', async () => {
    const { user, location } = renderApp();
    await user.click(screen.getByRole('button', { name: /start call/i }));
    await awaitCallScreen();

    act(() => elevenLabs.last.emitDisconnect({ reason: 'error', message: 'socket closed', context: {} }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Call disconnected');
    expect(location()).toBe(ROUTES.callerReady);
  });

  it('keeps the caller on the call until they confirm leaving', async () => {
    const { user, location } = renderApp();
    await user.click(screen.getByRole('button', { name: /start call/i }));
    await awaitCallScreen();

    await user.click(screen.getByRole('link', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(location()).toBe(ROUTES.callerCall);
    expect(elevenLabs.last.ended).toBe(false);

    await user.click(screen.getByRole('link', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: /yes, end the call/i }));

    await awaitReadyScreen();
    expect(location()).toBe(ROUTES.callerReady);
    expect(elevenLabs.last.ended).toBe(true);
  });

  it('sends a refreshed page back to Start call instead of a dead call screen', async () => {
    // A reload drops the in-memory store, which is what a fresh store represents here.
    const { location } = renderRoutes(routes, { store: makeStore(), route: ROUTES.callerCall });

    await waitFor(() => expect(location()).toBe(ROUTES.callerReady));
    expect(screen.getByRole('button', { name: /start call/i })).toBeInTheDocument();
  });
});
