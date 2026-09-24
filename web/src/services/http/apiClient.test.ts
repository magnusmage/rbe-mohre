import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test/mocks/browserApis';
import { ApiError, apiGet } from './apiClient';

afterEach(() => vi.useRealTimers());

describe('apiGet', () => {
  it('requests the configured base URL and parses JSON', async () => {
    const { calls } = stubFetch({ body: { ok: true } });

    await expect(apiGet<{ ok: boolean }>('/session/signed-url')).resolves.toEqual({ ok: true });
    expect(calls[0].url).toBe('http://api.test/session/signed-url');
    expect(calls[0].init?.method).toBe('GET');
    expect((calls[0].init?.headers as Record<string, string>).Accept).toBe('application/json');
  });

  it.each([
    ['detail', { detail: 'signed_url_unavailable' }, 'signed_url_unavailable'],
    ['message', { message: 'nope' }, 'nope'],
    ['error', { error: 'bad' }, 'bad'],
  ])('reads the server message from %s', async (_key, body, expected) => {
    stubFetch({ status: 502, body });

    const error = await apiGet('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('http');
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).message).toBe(expected);
  });

  it('falls back to the status text for a non-JSON error body', async () => {
    stubFetch({ status: 500, rawBody: '<html>boom</html>' });

    const error = (await apiGet('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('http');
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('ignores blank and non-string message fields', async () => {
    stubFetch({ status: 400, body: { detail: '   ', message: 42, error: 'usable' } });

    const error = (await apiGet('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.message).toBe('usable');
  });

  it('reports an invalid success body as a parse error', async () => {
    stubFetch({ status: 200, rawBody: 'not json' });

    const error = (await apiGet('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('parse');
  });

  it('reports a network failure', async () => {
    stubFetch({ networkError: true });

    const error = (await apiGet('/x').catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('network');
    expect(error.status).toBeNull();
  });

  it('times out a request that never answers', async () => {
    vi.useFakeTimers();
    stubFetch({ hang: true });

    const pending = apiGet('/x', { timeoutMs: 1000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);

    expect(((await pending) as ApiError).kind).toBe('timeout');
  });

  it('reports a caller-side abort separately from a timeout', async () => {
    stubFetch({ hang: true });
    const controller = new AbortController();

    const pending = apiGet('/x', { signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();

    expect(((await pending) as ApiError).kind).toBe('aborted');
  });

  it('leaves no timer behind after a successful request', async () => {
    vi.useFakeTimers();
    stubFetch({ body: {} });

    await apiGet('/x');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes its abort listener from the caller signal', async () => {
    stubFetch({ body: {} });
    const controller = new AbortController();
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener');

    await apiGet('/x', { signal: controller.signal });
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('ApiError', () => {
  it('carries its kind and status', () => {
    const error = new ApiError('http', 'nope', 418);
    expect(error.name).toBe('ApiError');
    expect(error.kind).toBe('http');
    expect(error.status).toBe(418);
    expect(error).toBeInstanceOf(Error);
  });
});
