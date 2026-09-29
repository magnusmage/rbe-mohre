import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/app/routes';
import { ApiError } from '@/services/http/apiClient';
import { ensureMicrophoneAccess, MicrophoneAccessError } from '@/services/media/microphone';
import { getSignedUrl } from '@/services/session/sessionApi';
import { voiceAgent } from '@/services/voice/voiceAgent';
import { makeStore, renderWithProviders, selectCallSession } from '@/test/utils';
import { ReadyScreen } from './ReadyScreen';

vi.mock('@/services/media/microphone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/media/microphone')>()),
  // MOCK: jsdom cannot prompt for microphone access.
  ensureMicrophoneAccess: vi.fn(async () => { }),
}));

vi.mock('@/services/session/sessionApi', () => ({
  // MOCK: stands in for the backend.
  getSignedUrl: vi.fn(async () => 'wss://agent.test/socket'),
}));

vi.mock('@/services/voice/voiceAgent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/voice/voiceAgent')>()),
  // MOCK: the ElevenLabs session is covered by voiceAgent.test.ts.
  voiceAgent: { connect: vi.fn(async () => 'conv_1'), end: vi.fn(async () => { }), setMuted: vi.fn() },
}));

const micMock = vi.mocked(ensureMicrophoneAccess);
const signedUrlMock = vi.mocked(getSignedUrl);
const connectMock = vi.mocked(voiceAgent.connect);

const renderReady = (store = makeStore()) =>
  renderWithProviders(<ReadyScreen />, {
    store,
    route: ROUTES.callerReady,
    extraRoutes: [{ path: ROUTES.callerCall, element: <div>in call screen</div> }],
  });

beforeEach(() => {
  micMock.mockResolvedValue(undefined);
  signedUrlMock.mockResolvedValue('wss://agent.test/socket');
  connectMock.mockResolvedValue('conv_1');
});

/**
 * The verification-fields fieldset (Worker ID / Case reference / PIN / spoken-language radios)
 * and the inline error <Alert> block on the ReadyScreen are currently commented out in
 * source. The tests below focus on the behaviour that survives that: the primary button's
 * label + disabled state, and the redux state driven by the useStartCall thunk.
 */

describe('ReadyScreen — starting a call', () => {
  it('runs the start flow and opens the call screen once connected', async () => {
    const { user, location, store } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));

    await waitFor(() => expect(location()).toBe(ROUTES.callerCall));
    expect(micMock).toHaveBeenCalledTimes(1);
    expect(signedUrlMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(selectCallSession(store).status).toBe('connected');
  });

  it('shows progress and locks the button while connecting', async () => {
    let release: (id: string) => void = () => { };
    connectMock.mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));
    const { user } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));

    const button = await screen.findByRole('button', { name: /connecting to assistant/i });
    expect(button).toBeDisabled();
    // The same text is announced politely for screen readers.
    expect(screen.getAllByText('Connecting to assistant…')).toHaveLength(2);

    release('conv_1');
  });

  it('ignores extra presses while a start is already running', async () => {
    let release: (id: string) => void = () => { };
    connectMock.mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));
    const { user } = renderReady();

    const button = screen.getByRole('button', { name: /start call/i });
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(micMock).toHaveBeenCalledTimes(1);
    release('conv_1');
  });

  it('does not navigate when the screen was left mid-connection', async () => {
    let release: (id: string) => void = () => { };
    connectMock.mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));
    const { user, unmount, location } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));
    unmount();
    release('conv_1');

    await waitFor(() => expect(connectMock).toHaveBeenCalled());
    expect(location()).toBe(ROUTES.callerReady);
  });
});

describe('ReadyScreen — failures', () => {
  it('switches the button label to "Try again" when the microphone is blocked', async () => {
    micMock.mockRejectedValue(new MicrophoneAccessError('denied'));
    const { user, location, store } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));

    expect(await screen.findByRole('button', { name: /try again/i })).toBeEnabled();
    expect(location()).toBe(ROUTES.callerReady);
    const state = selectCallSession(store);
    expect(state.status).toBe('failed');
    expect(state.error?.source).toBe('microphone');
  });

  it('keeps the failed state stable when an instant retry fails again', async () => {
    micMock.mockRejectedValue(new MicrophoneAccessError('denied'));
    const { user } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));
    const retry = await screen.findByRole('button', { name: /try again/i });

    await user.click(retry);

    // No spinner flash for a failure this fast; still parked on Try again.
    expect(screen.queryByText('Checking microphone…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('records an api-source error when the voice service is not live yet', async () => {
    signedUrlMock.mockRejectedValue(new ApiError('http', 'signed_url_unavailable', 502));
    const { user, store } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));

    await waitFor(() => expect(selectCallSession(store).status).toBe('failed'));
    const state = selectCallSession(store);
    expect(state.error?.source).toBe('api');
    // The 502 path attaches the repository link metadata even though the inline
    // <Alert> is commented out in the current UI.
    expect(state.error?.link?.label).toBe('rbe-mohre');
    expect(state.error?.link?.href).toBe('https://github.com/magnusmage/rbe-mohre');
  });

  it('reports a failed connection by parking on "Try again"', async () => {
    connectMock.mockRejectedValue(new Error('socket closed'));
    const { user, location, store } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(location()).toBe(ROUTES.callerReady);
    expect(selectCallSession(store).error?.source).toBe('connection');
  });

  it('surfaces an error left behind by a dropped call via the button label', () => {
    const store = makeStore({
      status: 'failed',
      error: { source: 'connection', title: 'Call disconnected', message: 'The call was interrupted.' },
    });
    renderReady(store);

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
