import { describe, expect, it } from 'vitest';
import { mockMicrophone, mockPermissionsQueryThrows } from '@/test/mocks/browserApis';
import { ensureMicrophoneAccess, MicrophoneAccessError, toMicrophoneErrorCode } from './microphone';

const codeOf = async (promise: Promise<unknown>) => {
  const error = (await promise.catch((e: unknown) => e)) as MicrophoneAccessError;
  expect(error).toBeInstanceOf(MicrophoneAccessError);
  return error.code;
};

describe('ensureMicrophoneAccess', () => {
  it('opens a stream when the permission has not been decided, then releases it', async () => {
    const { getUserMedia, tracks } = mockMicrophone({ permission: 'prompt' });

    await expect(ensureMicrophoneAccess()).resolves.toBeUndefined();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(tracks).toHaveLength(1);
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
  });

  it('still verifies a device exists when permission was already granted', async () => {
    const { getUserMedia, tracks } = mockMicrophone({ permission: 'granted' });

    await expect(ensureMicrophoneAccess()).resolves.toBeUndefined();
    expect(getUserMedia).toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it('fails fast without prompting when permission is blocked', async () => {
    const { getUserMedia } = mockMicrophone({ permission: 'denied' });

    expect(await codeOf(ensureMicrophoneAccess())).toBe('denied');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('still works when the Permissions API is unavailable', async () => {
    const { getUserMedia } = mockMicrophone({ permission: null });

    await expect(ensureMicrophoneAccess()).resolves.toBeUndefined();
    expect(getUserMedia).toHaveBeenCalled();
  });

  it('still works when the Permissions API rejects the query', async () => {
    const { getUserMedia } = mockMicrophone({ permission: 'prompt' });
    mockPermissionsQueryThrows();

    await expect(ensureMicrophoneAccess()).resolves.toBeUndefined();
    expect(getUserMedia).toHaveBeenCalled();
  });

  it('refuses on an insecure origin', async () => {
    mockMicrophone({ secureContext: false });
    expect(await codeOf(ensureMicrophoneAccess())).toBe('insecure-context');
  });

  it('refuses when the browser has no getUserMedia', async () => {
    mockMicrophone({ unsupported: true });
    expect(await codeOf(ensureMicrophoneAccess())).toBe('unsupported');
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'not-found'],
    ['OverconstrainedError', 'not-found'],
    ['NotReadableError', 'in-use'],
    ['AbortError', 'in-use'],
    ['WeirdError', 'unknown'],
  ] as const)('maps a %s from getUserMedia to %s', async (name, expected) => {
    mockMicrophone({ permission: 'prompt', getUserMediaError: new DOMException('x', name) });
    expect(await codeOf(ensureMicrophoneAccess())).toBe(expected);
  });

  it('maps a non-DOMException failure to unknown', async () => {
    mockMicrophone({ permission: 'prompt', getUserMediaError: new Error('boom') });
    expect(await codeOf(ensureMicrophoneAccess())).toBe('unknown');
  });
});

describe('toMicrophoneErrorCode', () => {
  it('passes through a code we raised ourselves', () => {
    expect(toMicrophoneErrorCode(new MicrophoneAccessError('in-use'))).toBe('in-use');
  });

  it('returns null for errors that are not microphone-related', () => {
    expect(toMicrophoneErrorCode(new Error('boom'))).toBeNull();
    expect(toMicrophoneErrorCode('boom')).toBeNull();
    expect(toMicrophoneErrorCode(new DOMException('x', 'DataCloneError'))).toBeNull();
  });
});
