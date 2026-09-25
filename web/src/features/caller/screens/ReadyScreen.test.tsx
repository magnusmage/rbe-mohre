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
  ensureMicrophoneAccess: vi.fn(async () => {}),
}));

vi.mock('@/services/session/sessionApi', () => ({
  // MOCK: stands in for the backend.
  getSignedUrl: vi.fn(async () => 'wss://agent.test/socket'),
}));

vi.mock('@/services/voice/voiceAgent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/voice/voiceAgent')>()),
  // MOCK: the ElevenLabs session is covered by voiceAgent.test.ts.
  voiceAgent: { connect: vi.fn(async () => 'conv_1'), end: vi.fn(async () => {}), setMuted: vi.fn() },
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

describe('ReadyScreen — form', () => {
  it('prefills the verification fields', () => {
    renderReady();

    expect(screen.getByLabelText('Worker ID')).toHaveValue('WRK-1002');
    expect(screen.getByLabelText('Case reference')).toHaveValue('LAB-1002');
    expect(screen.getByLabelText('One-time PIN (SMS)')).toHaveValue('4821');
  });

  it('lets the caller edit the fields', async () => {
    const { user } = renderReady();
    const workerId = screen.getByLabelText('Worker ID');

    await user.clear(workerId);
    await user.type(workerId, 'WRK-2000');
    expect(workerId).toHaveValue('WRK-2000');
  });

  it('lets the caller pick a spoken language', async () => {
    const { user } = renderReady();

    const english = screen.getByRole('radio', { name: 'English' });
    const arabic = screen.getByRole('radio', { name: 'العربية' });
    expect(english).toHaveAttribute('aria-checked', 'true');

    await user.click(arabic);
    expect(arabic).toHaveAttribute('aria-checked', 'true');
    expect(english).toHaveAttribute('aria-checked', 'false');
  });
});

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

  it('shows progress and locks the form while connecting', async () => {
    let release: (id: string) => void = () => {};
    connectMock.mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));
    const { user } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));

    const button = await screen.findByRole('button', { name: /connecting to assistant/i });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText('Worker ID')).toBeDisabled();
    // The same text is announced politely for screen readers.
    expect(screen.getAllByText('Connecting to assistant…')).toHaveLength(2);

    release('conv_1');
  });

  it('ignores extra presses while a start is already running', async () => {
    let release: (id: string) => void = () => {};
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
    let release: (id: string) => void = () => {};
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
  it('explains a blocked microphone and offers a retry', async () => {
    micMock.mockRejectedValue(new MicrophoneAccessError('denied'));
    const { user, location } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Microphone access needed');
    expect(alert).toHaveTextContent(/blocked/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
    expect(location()).toBe(ROUTES.callerReady);
  });

  it('keeps the message steady when an instant retry fails again', async () => {
    micMock.mockRejectedValue(new MicrophoneAccessError('denied'));
    const { user } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));
    const retry = await screen.findByRole('button', { name: /try again/i });

    await user.click(retry);

    // No spinner flash and no disappearing error for a failure this fast.
    expect(screen.getByRole('alert')).toHaveTextContent('Microphone access needed');
    expect(screen.queryByText('Checking microphone…')).not.toBeInTheDocument();
  });

  it('links to the repository when the voice service is not live yet', async () => {
    signedUrlMock.mockRejectedValue(new ApiError('http', 'signed_url_unavailable', 502));
    const { user } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Work is currently in progress.');
    const link = screen.getByRole('link', { name: 'rbe-mohre' });
    expect(link).toHaveAttribute('href', 'https://github.com/magnusmage/rbe-mohre');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('reports a failed connection', async () => {
    connectMock.mockRejectedValue(new Error('socket closed'));
    const { user, location } = renderReady();

    await user.click(screen.getByRole('button', { name: /start call/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't connect to the assistant");
    expect(location()).toBe(ROUTES.callerReady);
  });

  it('lets the caller dismiss the message', async () => {
    micMock.mockRejectedValue(new MicrophoneAccessError('denied'));
    const { user } = renderReady();
    await user.click(screen.getByRole('button', { name: /start call/i }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start call/i })).toBeInTheDocument();
  });

  it('surfaces an error left behind by a dropped call', () => {
    const store = makeStore({
      status: 'failed',
      error: { source: 'connection', title: 'Call disconnected', message: 'The call was interrupted.' },
    });
    renderReady(store);

    expect(screen.getByRole('alert')).toHaveTextContent('Call disconnected');
  });
});
