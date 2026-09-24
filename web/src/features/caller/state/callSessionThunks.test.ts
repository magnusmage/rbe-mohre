import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/http/apiClient';
import { ensureMicrophoneAccess, MicrophoneAccessError } from '@/services/media/microphone';
import { getSignedUrl } from '@/services/session/sessionApi';
import { voiceAgent, type VoiceAgentHandlers } from '@/services/voice/voiceAgent';
import { makeStore, selectCallSession } from '@/test/utils';
import { endCall, setMicrophoneMuted, startCall } from './callSessionSlice';

vi.mock('@/services/media/microphone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/media/microphone')>()),
  // MOCK: real permission prompts are not available in jsdom.
  ensureMicrophoneAccess: vi.fn(async () => {}),
}));

vi.mock('@/services/session/sessionApi', () => ({
  // MOCK: stands in for the backend; replace if a contract test is added.
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
const endMock = vi.mocked(voiceAgent.end);
const setMutedMock = vi.mocked(voiceAgent.setMuted);

/** Handlers the slice passed to the voice agent, so tests can fire SDK events. */
const sdkHandlers = (): VoiceAgentHandlers => connectMock.mock.calls.at(-1)![1];

beforeEach(() => {
  micMock.mockResolvedValue(undefined);
  signedUrlMock.mockResolvedValue('wss://agent.test/socket');
  connectMock.mockResolvedValue('conv_1');
  endMock.mockResolvedValue(undefined);
});

describe('startCall', () => {
  it('runs microphone, signed URL and connection in order', async () => {
    const store = makeStore();
    const order: string[] = [];
    micMock.mockImplementation(async () => void order.push('microphone'));
    signedUrlMock.mockImplementation(async () => {
      order.push('signed-url');
      return 'wss://agent.test/socket';
    });
    connectMock.mockImplementation(async () => {
      order.push('connect');
      return 'conv_1';
    });

    const result = await store.dispatch(startCall());

    expect(order).toEqual(['microphone', 'signed-url', 'connect']);
    expect(startCall.fulfilled.match(result)).toBe(true);
    expect(connectMock.mock.calls[0][0]).toBe('wss://agent.test/socket');

    const state = selectCallSession(store);
    expect(state.status).toBe('connected');
    expect(state.conversationId).toBe('conv_1');
    expect(state.startedAt).not.toBeNull();
    expect(state.signedUrlRequest.status).toBe('succeeded');
  });

  it('stops at the microphone step when access is refused', async () => {
    const store = makeStore();
    micMock.mockRejectedValue(new MicrophoneAccessError('denied'));

    await store.dispatch(startCall());

    expect(signedUrlMock).not.toHaveBeenCalled();
    expect(connectMock).not.toHaveBeenCalled();
    const state = selectCallSession(store);
    expect(state.status).toBe('failed');
    expect(state.error?.source).toBe('microphone');
  });

  it('stops at the signed URL step when the backend fails', async () => {
    const store = makeStore();
    signedUrlMock.mockRejectedValue(new ApiError('http', 'signed_url_unavailable', 502));

    await store.dispatch(startCall());

    expect(connectMock).not.toHaveBeenCalled();
    const state = selectCallSession(store);
    expect(state.status).toBe('failed');
    expect(state.error?.source).toBe('api');
    expect(state.error?.link?.label).toBe('rbe-mohre');
    expect(state.signedUrlRequest.status).toBe('failed');
  });

  it('reports a connection failure from the voice agent', async () => {
    const store = makeStore();
    connectMock.mockRejectedValue(new Error('socket closed'));

    await store.dispatch(startCall());

    const state = selectCallSession(store);
    expect(state.status).toBe('failed');
    expect(state.error?.source).toBe('connection');
    expect(state.startedAt).toBeNull();
  });

  it('ignores a duplicate start while one is already running', async () => {
    const store = makeStore();
    let release: (id: string) => void = () => {};
    connectMock.mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));

    const first = store.dispatch(startCall());
    const second = await store.dispatch(startCall());

    expect(startCall.rejected.match(second)).toBe(true);
    expect((second as { meta: { condition?: boolean } }).meta.condition).toBe(true);
    expect(micMock).toHaveBeenCalledTimes(1);

    // Let the first attempt reach the connect step before releasing it.
    await vi.waitFor(() => expect(connectMock).toHaveBeenCalled());
    release('conv_1');
    await first;
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(selectCallSession(store).status).toBe('connected');
  });

  it('allows a completely new call after one ended', async () => {
    const store = makeStore();
    await store.dispatch(startCall());
    await store.dispatch(endCall());
    expect(selectCallSession(store).status).toBe('ended');

    connectMock.mockResolvedValue('conv_2');
    await store.dispatch(startCall());

    const state = selectCallSession(store);
    expect(state.status).toBe('connected');
    expect(state.conversationId).toBe('conv_2');
    expect(state.durationSeconds).toBeNull();
  });

  it('feeds SDK events back into the store', async () => {
    const store = makeStore();
    await store.dispatch(startCall());

    sdkHandlers().onModeChange('speaking');
    expect(selectCallSession(store).agentMode).toBe('speaking');

    sdkHandlers().onStatusChange?.('disconnecting');
    expect(selectCallSession(store).agentStatus).toBe('disconnecting');

    sdkHandlers().onError?.('audio glitch');
    expect(selectCallSession(store).agentError).toBe('audio glitch');

    sdkHandlers().onDisconnect({ reason: 'agent' });
    const state = selectCallSession(store);
    expect(state.status).toBe('ended');
    expect(state.durationSeconds).not.toBeNull();
  });

  it('marks the call failed when the SDK drops it unexpectedly', async () => {
    const store = makeStore();
    await store.dispatch(startCall());

    sdkHandlers().onDisconnect({ reason: 'error', message: 'socket closed', context: { type: 'websocket', code: 1006 } });

    const state = selectCallSession(store);
    expect(state.status).toBe('failed');
    expect(state.error?.title).toBe('Call disconnected');
  });
});

describe('endCall', () => {
  it('closes the session and finalises the call', async () => {
    const store = makeStore();
    await store.dispatch(startCall());

    await store.dispatch(endCall());

    expect(endMock).toHaveBeenCalledTimes(1);
    const state = selectCallSession(store);
    expect(state.status).toBe('ended');
    expect(state.conversationId).toBeNull();
    expect(state.muted).toBe(false);
  });

  it('ignores a second end while teardown is running', async () => {
    const store = makeStore();
    await store.dispatch(startCall());

    let release: () => void = () => {};
    endMock.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));

    const first = store.dispatch(endCall());
    const second = await store.dispatch(endCall());

    expect((second as { meta: { condition?: boolean } }).meta.condition).toBe(true);
    expect(endMock).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => expect(release).not.toBe(undefined));
    release();
    await first;
    expect(selectCallSession(store).status).toBe('ended');
  });

  it('still finalises the call when teardown throws', async () => {
    const store = makeStore();
    await store.dispatch(startCall());
    endMock.mockRejectedValue(new Error('sdk blew up'));

    await store.dispatch(endCall());

    expect(selectCallSession(store).status).toBe('ended');
  });

  it('is harmless with no call in progress', async () => {
    const store = makeStore();
    await store.dispatch(endCall());

    expect(selectCallSession(store).status).toBe('idle');
  });
});

describe('setMicrophoneMuted', () => {
  it('mutes the live session and records it', async () => {
    const store = makeStore();
    await store.dispatch(startCall());

    store.dispatch(setMicrophoneMuted(true));
    expect(setMutedMock).toHaveBeenCalledWith(true);
    expect(selectCallSession(store).muted).toBe(true);

    store.dispatch(setMicrophoneMuted(false));
    expect(selectCallSession(store).muted).toBe(false);
  });
});
