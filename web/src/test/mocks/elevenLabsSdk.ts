import { vi } from 'vitest';

/**
 * MOCK — stands in for `@elevenlabs/client`.
 *
 * The real SDK opens a WebSocket and takes over the microphone, so it is never used in
 * tests. This fake records what the app asked for and lets a test drive every SDK event
 * (`onConnect` via resolution, `onDisconnect`, `onError`, `onModeChange`, `onStatusChange`).
 *
 * Replace with: nothing — the SDK stays mocked in unit/component tests. Real-session
 * behaviour is only verifiable manually or in a future E2E suite.
 *
 * Usage in a test file (the factory must be inside `vi.mock`, which is hoisted):
 *
 *   vi.mock('@elevenlabs/client', async () => (await import('@/test/mocks/elevenLabsSdk')).sdkModuleMock());
 */

export type FakeMode = 'speaking' | 'listening';
export type FakeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
export type FakeDisconnectionDetails =
  | { reason: 'error'; message: string; context: unknown }
  | { reason: 'agent' }
  | { reason: 'user' };

export interface FakeStartSessionOptions {
  signedUrl?: string;
  connectionType?: string;
  textOnly?: boolean;
  onConnect?: (props: { conversationId: string }) => void;
  onDisconnect?: (details: FakeDisconnectionDetails) => void;
  onError?: (message: string, context?: unknown) => void;
  onModeChange?: (props: { mode: FakeMode }) => void;
  onStatusChange?: (props: { status: FakeConnectionStatus }) => void;
}

export class FakeConversation {
  /** Set once `endSession` has run, so tests can assert resources were released. */
  ended = false;
  micMuted: boolean | null = null;

  readonly endSession = vi.fn(async () => {
    if (this.ended) return;
    this.ended = true;
    this.emitStatus('disconnected');
    this.emitDisconnect({ reason: 'user' });
  });

  readonly setMicMuted = vi.fn((muted: boolean) => {
    this.micMuted = muted;
  });

  constructor(
    readonly id: string,
    readonly options: FakeStartSessionOptions,
  ) {}

  getId(): string {
    return this.id;
  }

  /** Agent started/stopped speaking. */
  emitMode(mode: FakeMode) {
    this.options.onModeChange?.({ mode });
  }

  emitStatus(status: FakeConnectionStatus) {
    this.options.onStatusChange?.({ status });
  }

  /** Non-fatal SDK error. */
  emitError(message: string) {
    this.options.onError?.(message);
  }

  /** Agent hang-up, user end, or an unexpected drop. */
  emitDisconnect(details: FakeDisconnectionDetails) {
    this.options.onDisconnect?.(details);
  }
}

type Behaviour = 'resolve' | 'reject' | 'never';

class FakeElevenLabs {
  /** Every session the app asked for, in order. */
  sessions: FakeConversation[] = [];
  behaviour: Behaviour = 'resolve';
  failWith: unknown = new Error('connection refused');
  /** Delay before `startSession` settles, for timeout tests (needs fake timers). */
  connectDelayMs = 0;

  private nextId = 1;

  readonly startSession = vi.fn(async (options: FakeStartSessionOptions) => {
    const conversation = new FakeConversation(`conv_${this.nextId++}`, options);
    this.sessions.push(conversation);
    conversation.emitStatus('connecting');

    if (this.behaviour === 'never') return new Promise<never>(() => {});
    if (this.connectDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.connectDelayMs));
    }
    if (this.behaviour === 'reject') throw this.failWith;

    conversation.emitStatus('connected');
    conversation.options.onConnect?.({ conversationId: conversation.id });
    return conversation;
  });

  get last(): FakeConversation {
    const session = this.sessions.at(-1);
    if (!session) throw new Error('No fake ElevenLabs session was started.');
    return session;
  }

  reset() {
    this.sessions = [];
    this.behaviour = 'resolve';
    this.failWith = new Error('connection refused');
    this.connectDelayMs = 0;
    this.nextId = 1;
    this.startSession.mockClear();
  }
}

export const elevenLabs = new FakeElevenLabs();

/** Module shape returned to `vi.mock('@elevenlabs/client', …)`. */
export function sdkModuleMock() {
  return {
    Conversation: {
      startSession: (options: FakeStartSessionOptions) => elevenLabs.startSession(options),
    },
  };
}
