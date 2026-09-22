export type MicrophoneErrorCode = 'insecure-context' | 'unsupported' | 'denied' | 'not-found' | 'in-use' | 'unknown';

export class MicrophoneAccessError extends Error {
  readonly code: MicrophoneErrorCode;

  constructor(code: MicrophoneErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'MicrophoneAccessError';
    this.code = code;
  }
}

/** Current permission state, or `null` when the Permissions API can't tell us (e.g. Firefox/Safari). */
async function queryMicrophonePermission(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    return status?.state ?? null;
  } catch {
    return null;
  }
}

export function toMicrophoneErrorCode(error: unknown): MicrophoneErrorCode | null {
  if (error instanceof MicrophoneAccessError) return error.code;
  if (!(error instanceof DOMException)) return null;
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not-found';
    case 'NotReadableError':
    case 'AbortError':
      return 'in-use';
    default:
      return null;
  }
}

/**
 * Ensures the page can capture audio. Checks the current permission first and only
 * prompts the user when the permission hasn't been decided yet.
 * @throws MicrophoneAccessError
 */
export async function ensureMicrophoneAccess(): Promise<void> {
  if (!window.isSecureContext) throw new MicrophoneAccessError('insecure-context');
  if (!navigator.mediaDevices?.getUserMedia) throw new MicrophoneAccessError('unsupported');

  const permission = await queryMicrophonePermission();
  if (permission === 'denied') throw new MicrophoneAccessError('denied');

  try {
    // Opening a stream triggers the prompt when needed and confirms a device exists.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    throw new MicrophoneAccessError(toMicrophoneErrorCode(error) ?? 'unknown');
  }
}
