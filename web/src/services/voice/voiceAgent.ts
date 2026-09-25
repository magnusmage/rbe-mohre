import type { DisconnectionDetails, VoiceConversation } from '@elevenlabs/client';

export type AgentMode = 'speaking' | 'listening';
export type AgentConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export interface VoiceAgentHandlers {
  onModeChange: (mode: AgentMode) => void;
  onDisconnect: (details: DisconnectionDetails) => void;
  /** Non-fatal SDK error; a fatal one also triggers `onDisconnect`. */
  onError?: (message: string) => void;
  /** Underlying SDK connection status (connecting / connected / disconnecting / disconnected). */
  onStatusChange?: (status: AgentConnectionStatus) => void;
}

export class VoiceConnectionTimeoutError extends Error {
  constructor() {
    super('Timed out connecting to the voice agent.');
    this.name = 'VoiceConnectionTimeoutError';
  }
}

const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;

/**
 * Owns the single live ElevenLabs voice session. The conversation object is not
 * serialisable, so it lives here rather than in the Redux store; Redux only holds status.
 */
class VoiceAgentService {
  private conversation: VoiceConversation | null = null;
  /** Incremented per connect so callbacks from superseded sessions are ignored. */
  private generation = 0;

  get isActive(): boolean {
    return this.conversation !== null;
  }

  /** Connects using a signed URL. Resolves with the conversation id once the session is live. */
  async connect(signedUrl: string, handlers: VoiceAgentHandlers, timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS): Promise<string> {
    const generation = ++this.generation;
    await this.endCurrent();

    const isCurrent = () => generation === this.generation;
    // Loaded on demand so the SDK is only downloaded when a call is started.
    const { Conversation } = await import('@elevenlabs/client');
    if (!isCurrent()) throw new Error('Voice session was superseded.');

    const sessionPromise = Conversation.startSession({
      signedUrl,
      connectionType: 'websocket',
      textOnly: false,
      onModeChange: ({ mode }) => {
        if (isCurrent()) handlers.onModeChange(mode);
      },
      onDisconnect: (details) => {
        if (!isCurrent()) return;
        // Release the reference as soon as the SDK reports the session is gone, so
        // a later end() cannot act on a dead conversation.
        this.conversation = null;
        handlers.onDisconnect(details);
      },
      onError: (message) => {
        if (isCurrent()) handlers.onError?.(message);
      },
      onStatusChange: ({ status }) => {
        if (isCurrent()) handlers.onStatusChange?.(status);
      },
    }) as Promise<VoiceConversation>;

    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new VoiceConnectionTimeoutError()), timeoutMs);
    });

    try {
      const conversation = await Promise.race([sessionPromise, timeout]);
      if (!isCurrent()) {
        // A newer connect() or end() superseded this attempt while it was pending;
        // the catch block below closes the orphaned session.
        throw new Error('Voice session was superseded.');
      }
      this.conversation = conversation;
      return conversation.getId();
    } catch (error) {
      // Close the session if it comes up after we gave up (timeout or superseded).
      sessionPromise.then((c) => c.endSession()).catch(() => undefined);
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  setMuted(muted: boolean): void {
    this.conversation?.setMicMuted(muted);
  }

  /** Ends the live session (if any) and invalidates any in-flight connect. */
  async end(): Promise<void> {
    this.generation++;
    await this.endCurrent();
  }

  private async endCurrent(): Promise<void> {
    const conversation = this.conversation;
    this.conversation = null;
    if (conversation) {
      try {
        await conversation.endSession();
      } catch {
        // Session already closed.
      }
    }
  }
}

export const voiceAgent = new VoiceAgentService();
