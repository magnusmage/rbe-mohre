import { describe, expect, it } from 'vitest';
import { stubFetch } from '@/test/mocks/browserApis';
import { ApiError } from '@/services/http/apiClient';
import { getSignedUrl } from './sessionApi';

const SIGNED_URL = 'wss://api.elevenlabs.io/v1/convai/conversation?token=abc';

describe('getSignedUrl', () => {
  it('calls GET /session/signed-url and returns the snake_case url', async () => {
    const { calls } = stubFetch({ body: { signed_url: SIGNED_URL } });

    await expect(getSignedUrl()).resolves.toBe(SIGNED_URL);
    expect(calls[0].url).toBe('http://api.test/session/signed-url');
  });

  it('accepts a camelCase url', async () => {
    stubFetch({ body: { signedUrl: SIGNED_URL } });
    await expect(getSignedUrl()).resolves.toBe(SIGNED_URL);
  });

  it('accepts a plain ws url', async () => {
    stubFetch({ body: { signed_url: 'ws://localhost:1234/convai' } });
    await expect(getSignedUrl()).resolves.toBe('ws://localhost:1234/convai');
  });

  it.each([
    ['a missing url', {}],
    ['a non-string url', { signed_url: 42 }],
    ['an http url', { signed_url: 'https://example.com/socket' }],
    ['an empty string', { signed_url: '' }],
  ])('rejects %s as an invalid response', async (_case, body) => {
    stubFetch({ body });

    const error = (await getSignedUrl().catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe('parse');
    expect(error.message).toMatch(/valid signed URL/i);
  });

  it('passes the caller abort signal through', async () => {
    const { calls } = stubFetch({ body: { signed_url: SIGNED_URL } });
    const controller = new AbortController();

    await getSignedUrl(controller.signal);
    expect(calls[0].init?.signal).toBeDefined();
  });

  it('propagates transport errors unchanged', async () => {
    stubFetch({ networkError: true });

    const error = (await getSignedUrl().catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('network');
  });
});
