import type { DisconnectionDetails } from '@elevenlabs/client';
import { PROJECT_REPOSITORY } from '@/config/links';
import { ApiError } from '@/services/http/apiClient';
import { toMicrophoneErrorCode, type MicrophoneErrorCode } from '@/services/media/microphone';
import { VoiceConnectionTimeoutError } from '@/services/voice/voiceAgent';

export type CallErrorSource = 'microphone' | 'api' | 'connection';

export interface CallErrorLink {
  label: string;
  href: string;
}

/** Serialisable, user-facing error stored in Redux. */
export interface CallError {
  source: CallErrorSource;
  title: string;
  message: string;
  /** Optional external link rendered right after the message. */
  link?: CallErrorLink;
}

const MICROPHONE_MESSAGES: Record<MicrophoneErrorCode, string> = {
  denied:
    'Microphone access is blocked. Allow microphone access for this site in your browser settings, then press Start call again.',
  'not-found': 'No microphone was found. Connect a microphone or headset and try again.',
  'in-use': 'Your microphone is being used by another application. Close it and try again.',
  'insecure-context': 'Voice calls need a secure (HTTPS) connection. Open the site over HTTPS and try again.',
  unsupported: "This browser doesn't support voice calls. Please use a recent version of Chrome, Edge, Safari or Firefox.",
  unknown: "We couldn't access your microphone. Check your device and browser settings, then try again.",
};

export function microphoneError(error: unknown): CallError {
  return {
    source: 'microphone',
    title: 'Microphone access needed',
    message: MICROPHONE_MESSAGES[toMicrophoneErrorCode(error) ?? 'unknown'],
  };
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    console.log('API error:', error.kind, error.status, error);
    switch (error.kind) {
      case 'network':
        return "We couldn't reach the call service. Check your internet connection and try again.";
      case 'timeout':
        return 'The call service took too long to respond. Please try again.';
      case 'aborted':
        return 'The request was cancelled.';
      case 'parse':
        return 'The call service returned an unexpected response. Please try again later.';
      case 'http':
        if (error.status !== null && error.status >= 500) {
          return 'The call service is temporarily unavailable. Please try again in a few minutes.';
        }
        if (error.status === 401 || error.status === 403) {
          return 'You are not authorised to start a call. Please sign in again.';
        }
        if (error.status === 429) {
          return 'Too many call attempts. Please wait a moment and try again.';
        }
        return error.message || "We couldn't start a call session. Please try again.";
    }
  }
  return "We couldn't start a call session. Please try again.";
}

/** Backend reports the voice session service isn't available yet (HTTP 502, `detail: "signed_url_unavailable"`). */
function isSignedUrlUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 502 && error.message === 'signed_url_unavailable';
}

export function apiError(error: unknown): CallError {
  const title = "Couldn't start the session";
  if (isSignedUrlUnavailable(error)) {
    return {
      source: 'api',
      title,
      message: 'Work is currently in progress. You can review the implementation on GitHub:',
      link: { ...PROJECT_REPOSITORY },
    };
  }
  return { source: 'api', title, message: apiErrorMessage(error) };
}

/** Matches the SDK's SessionConnectionError without importing the (lazy-loaded) SDK. */
function hasCloseReason(error: unknown): error is { closeReason: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { closeReason?: unknown }).closeReason === 'string' &&
    (error as { closeReason: string }).closeReason.length > 0
  );
}

export function connectionError(error: unknown): CallError {
  // The SDK may itself request the microphone while connecting.
  if (toMicrophoneErrorCode(error)) return microphoneError(error);

  let message = "We couldn't connect you to the assistant. Please try again.";
  if (error instanceof VoiceConnectionTimeoutError) {
    message = 'Connecting to the assistant took too long. Check your connection and try again.';
  } else if (hasCloseReason(error)) {
    message = `The assistant ended the connection: ${error.closeReason}. Please try again.`;
  }
  return { source: 'connection', title: "Couldn't connect to the assistant", message };
}

/** Error shown after an established call drops unexpectedly. */
export function droppedCallError(details: Extract<DisconnectionDetails, { reason: 'error' }>): CallError {
  return {
    source: 'connection',
    title: 'Call disconnected',
    message: `The call was interrupted${details.message ? ` (${details.message})` : ''}. Please start a new call.`,
  };
}
