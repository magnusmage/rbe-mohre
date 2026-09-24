import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elevenLabs, type FakeDisconnectionDetails } from '@/test/mocks/elevenLabsSdk';
import { voiceAgent, VoiceConnectionTimeoutError, type VoiceAgentHandlers } from './voiceAgent';

vi.mock('@elevenlabs/client', async () => (await import('@/test/mocks/elevenLabsSdk')).sdkModuleMock());

const SIGNED_URL = 'wss://api.elevenlabs.io/v1/convai/conversation?token=abc';

type MockedHandlers = { [K in keyof Required<VoiceAgentHandlers>]: ReturnType<typeof vi.fn> };

function handlers(): VoiceAgentHandlers & MockedHandlers {
  return {
    onModeChange: vi.fn(),
    onDisconnect: vi.fn(),
    onError: vi.fn(),
    onStatusChange: vi.fn(),
  } as unknown as VoiceAgentHandlers & MockedHandlers;
}

beforeEach(() => {
  elevenLabs.reset();
});

afterEach(async () => {
  // Never leak a live session into the next test.
  await voiceAgent.end();
  vi.useRealTimers();
});

describe('voiceAgent.connect', () => {
  it('opens a websocket session with the signed URL and returns the conversation id', async () => {
    const id = await voiceAgent.connect(SIGNED_URL, handlers());

    expect(id).toBe('conv_1');
    expect(voiceAgent.isActive).toBe(true);
    expect(elevenLabs.startSession).toHaveBeenCalledTimes(1);
    const options = elevenLabs.startSession.mock.calls[0][0];
    expect(options.signedUrl).toBe(SIGNED_URL);
    expect(options.connectionType).toBe('websocket');
    expect(options.textOnly).toBe(false);
  });

  it('forwards agent mode changes', async () => {
    const h = handlers();
    await voiceAgent.connect(SIGNED_URL, h);

    elevenLabs.last.emitMode('speaking');
    expect(h.onModeChange).toHaveBeenCalledWith('speaking');
  });

  it('forwards SDK connection status changes', async () => {
    const h = handlers();
    await voiceAgent.connect(SIGNED_URL, h);

    elevenLabs.last.emitStatus('disconnecting');
    expect(h.onStatusChange).toHaveBeenCalledWith('disconnecting');
  });

  it('forwards non-fatal SDK errors', async () => {
    const h = handlers();
    await voiceAgent.connect(SIGNED_URL, h);

    elevenLabs.last.emitError('audio glitch');
    expect(h.onError).toHaveBeenCalledWith('audio glitch');
  });

  it.each([
    [{ reason: 'agent' }],
    [{ reason: 'user' }],
    [{ reason: 'error', message: 'socket closed', context: {} }],
  ] as [FakeDisconnectionDetails][])('forwards %j disconnections and drops the session', async (details) => {
    const h = handlers();
    await voiceAgent.connect(SIGNED_URL, h);

    elevenLabs.last.emitDisconnect(details);

    expect(h.onDisconnect).toHaveBeenCalledWith(details);
    expect(voiceAgent.isActive).toBe(false);
  });

  it('propagates a connection failure and stays inactive', async () => {
    elevenLabs.behaviour = 'reject';
    elevenLabs.failWith = new Error('connection refused');

    await expect(voiceAgent.connect(SIGNED_URL, handlers())).rejects.toThrow('connection refused');
    expect(voiceAgent.isActive).toBe(false);
  });

  it('times out a connection that never completes', async () => {
    vi.useFakeTimers();
    elevenLabs.behaviour = 'never';

    const pending = voiceAgent.connect(SIGNED_URL, handlers(), 1000).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await pending).toBeInstanceOf(VoiceConnectionTimeoutError);
    expect(voiceAgent.isActive).toBe(false);
  });

  it('closes a session that arrives after the timeout', async () => {
    vi.useFakeTimers();
    elevenLabs.connectDelayMs = 5000;

    const pending = voiceAgent.connect(SIGNED_URL, handlers(), 1000).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeInstanceOf(VoiceConnectionTimeoutError);

    // The late session must not be left holding the microphone.
    await vi.advanceTimersByTimeAsync(5000);
    expect(elevenLabs.last.endSession).toHaveBeenCalled();
    expect(voiceAgent.isActive).toBe(false);
  });

  it('ends the previous session before starting a new one', async () => {
    await voiceAgent.connect(SIGNED_URL, handlers());
    const first = elevenLabs.last;

    const id = await voiceAgent.connect(SIGNED_URL, handlers());

    expect(first.endSession).toHaveBeenCalled();
    expect(id).toBe('conv_2');
    expect(elevenLabs.startSession).toHaveBeenCalledTimes(2);
  });

  it('ignores callbacks from a superseded session', async () => {
    const first = handlers();
    await voiceAgent.connect(SIGNED_URL, first);
    const firstSession = elevenLabs.last;
    first.onDisconnect.mockClear();

    await voiceAgent.connect(SIGNED_URL, handlers());

    firstSession.emitMode('speaking');
    firstSession.emitError('old error');
    firstSession.emitDisconnect({ reason: 'agent' });

    expect(first.onModeChange).not.toHaveBeenCalled();
    expect(first.onError).not.toHaveBeenCalled();
    expect(first.onDisconnect).not.toHaveBeenCalled();
    // The newer session is still the live one.
    expect(voiceAgent.isActive).toBe(true);
  });

  it('never opens a session when end() lands while the SDK is still loading', async () => {
    const pending = voiceAgent.connect(SIGNED_URL, handlers()).catch((e: unknown) => e);
    await voiceAgent.end();

    await pending;
    expect(elevenLabs.startSession).not.toHaveBeenCalled();
    expect(voiceAgent.isActive).toBe(false);
  });

  it('closes a session that resolves after end() was called', async () => {
    vi.useFakeTimers();
    elevenLabs.connectDelayMs = 500;

    const pending = voiceAgent.connect(SIGNED_URL, handlers()).catch((e: unknown) => e);
    // Let the lazy SDK import settle so the session is actually in flight.
    await vi.waitFor(() => expect(elevenLabs.startSession).toHaveBeenCalled());

    await voiceAgent.end();
    await vi.advanceTimersByTimeAsync(500);

    await pending;
    expect(elevenLabs.last.endSession).toHaveBeenCalled();
    expect(voiceAgent.isActive).toBe(false);
  });
});

describe('voiceAgent.end', () => {
  it('closes the live session and releases its resources', async () => {
    await voiceAgent.connect(SIGNED_URL, handlers());
    const session = elevenLabs.last;

    await voiceAgent.end();

    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(session.ended).toBe(true);
    expect(voiceAgent.isActive).toBe(false);
  });

  it('is safe to call twice', async () => {
    await voiceAgent.connect(SIGNED_URL, handlers());
    const session = elevenLabs.last;

    await voiceAgent.end();
    await voiceAgent.end();

    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(voiceAgent.isActive).toBe(false);
  });

  it('is a no-op when no call is running', async () => {
    await expect(voiceAgent.end()).resolves.toBeUndefined();
    expect(elevenLabs.startSession).not.toHaveBeenCalled();
  });

  it('still clears the session when the SDK throws while closing', async () => {
    await voiceAgent.connect(SIGNED_URL, handlers());
    elevenLabs.last.endSession.mockRejectedValueOnce(new Error('already closed'));

    await expect(voiceAgent.end()).resolves.toBeUndefined();
    expect(voiceAgent.isActive).toBe(false);
  });

  it('does not try to close a session the SDK already dropped', async () => {
    await voiceAgent.connect(SIGNED_URL, handlers());
    const session = elevenLabs.last;
    session.emitDisconnect({ reason: 'agent' });

    await voiceAgent.end();
    expect(session.endSession).not.toHaveBeenCalled();
  });

  it('allows a fresh call afterwards', async () => {
    await voiceAgent.connect(SIGNED_URL, handlers());
    await voiceAgent.end();

    await expect(voiceAgent.connect(SIGNED_URL, handlers())).resolves.toBe('conv_2');
    expect(voiceAgent.isActive).toBe(true);
  });
});

describe('voiceAgent.setMuted', () => {
  it('mutes and unmutes the live session', async () => {
    await voiceAgent.connect(SIGNED_URL, handlers());

    voiceAgent.setMuted(true);
    expect(elevenLabs.last.micMuted).toBe(true);

    voiceAgent.setMuted(false);
    expect(elevenLabs.last.micMuted).toBe(false);
  });

  it('does nothing when there is no session', () => {
    expect(() => voiceAgent.setMuted(true)).not.toThrow();
  });
});
