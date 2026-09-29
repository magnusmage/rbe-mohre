import { AxiosError, AxiosHeaders, CanceledError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { afterEach, vi } from 'vitest';
import { httpClient } from '@/services/http/apiClient';

/**
 * MOCK — browser APIs jsdom does not implement.
 *
 * Replace with: nothing for unit/component tests; real permission prompts and clipboard
 * access can only be exercised manually or in a future E2E suite.
 */

export interface MicrophoneMockOptions {
  /** Result of `navigator.permissions.query`; `null` means the API is unavailable. */
  permission?: PermissionState | null;
  /** Error thrown by `getUserMedia` instead of returning a stream. */
  getUserMediaError?: unknown;
  /** Simulates a browser without `mediaDevices`. */
  unsupported?: boolean;
  secureContext?: boolean;
}

export interface MicrophoneMock {
  getUserMedia: ReturnType<typeof vi.fn>;
  /** Tracks handed out by `getUserMedia`, so tests can assert they were stopped. */
  tracks: { stop: ReturnType<typeof vi.fn> }[];
}

/** Installs a fake microphone stack on `navigator`/`window` for one test. */
export function mockMicrophone({
  permission = 'prompt',
  getUserMediaError,
  unsupported = false,
  secureContext = true,
}: MicrophoneMockOptions = {}): MicrophoneMock {
  const tracks: { stop: ReturnType<typeof vi.fn> }[] = [];

  const getUserMedia = vi.fn(async () => {
    if (getUserMediaError) throw getUserMediaError;
    const track = { stop: vi.fn() };
    tracks.push(track);
    return { getTracks: () => [track] } as unknown as MediaStream;
  });

  Object.defineProperty(window, 'isSecureContext', { value: secureContext, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: unsupported ? undefined : { getUserMedia },
    configurable: true,
  });
  Object.defineProperty(navigator, 'permissions', {
    value: permission === null ? undefined : { query: vi.fn(async () => ({ state: permission })) },
    configurable: true,
  });

  return { getUserMedia, tracks };
}

/** Makes `navigator.permissions.query` reject, as older browsers do for `microphone`. */
export function mockPermissionsQueryThrows() {
  Object.defineProperty(navigator, 'permissions', {
    value: { query: vi.fn(async () => Promise.reject(new Error('not supported'))) },
    configurable: true,
  });
}

/** Installs a clipboard stub; `failing` makes writes reject. */
export function mockClipboard(failing = false) {
  const writeText = vi.fn(async (text: string) => {
    if (failing) throw new Error('denied');
    return text;
  });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

export interface FetchStubResponse {
  status?: number;
  body?: unknown;
  /** Sent instead of JSON, for invalid-body cases. */
  rawBody?: string;
  /** Rejects the request (transport-level failure). */
  networkError?: boolean;
  /** Never settles until the request is aborted, for timeout/abort cases. */
  hang?: boolean;
}

/** Recorded shape mirrors the pre-Axios `fetch(input, init)` for test parity. */
export interface StubbedCall {
  url: string;
  init?: {
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    body?: unknown;
  };
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/** Restore the shared axios instance's adapter after every test that stubbed it. */
const originalAdapter = httpClient.defaults.adapter;
afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
});

/**
 * MOCK — stands in for the RBE backend by swapping the shared Axios adapter.
 * Replace with: a contract test against a real staging backend, if that is ever wanted.
 */
export function stubFetch(responses: FetchStubResponse | FetchStubResponse[]) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls: StubbedCall[] = [];

  const adapter: AxiosAdapter = (config) => {
    const url = `${config.baseURL ?? ''}${config.url ?? ''}`;
    const headers: Record<string, string> = {};
    const rawHeaders = config.headers;
    if (rawHeaders) {
      // Normalise AxiosHeaders / plain object into a flat record for assertions.
      const flat =
        rawHeaders instanceof AxiosHeaders ? rawHeaders.toJSON() : (rawHeaders as Record<string, unknown>);
      for (const [key, value] of Object.entries(flat)) {
        if (typeof value === 'string') headers[key] = value;
      }
    }
    calls.push({
      url,
      init: {
        method: config.method?.toUpperCase(),
        headers,
        signal: (config.signal as AbortSignal | undefined) ?? undefined,
        body: config.data,
      },
    });

    const next = queue.length > 1 ? queue.shift()! : queue[0];

    if (next.networkError) {
      return Promise.reject(new AxiosError('Failed to fetch', 'ERR_NETWORK', config));
    }

    if (next.hang) {
      return new Promise<AxiosResponse>((_, reject) => {
        const signal = config.signal as AbortSignal | undefined;
        let timer: ReturnType<typeof setTimeout> | null = null;
        if (config.timeout && config.timeout > 0) {
          timer = setTimeout(() => {
            reject(new AxiosError('timeout of ' + config.timeout + 'ms exceeded', 'ECONNABORTED', config));
          }, config.timeout);
        }
        signal?.addEventListener(
          'abort',
          () => {
            if (timer) clearTimeout(timer);
            reject(new CanceledError('canceled', undefined, config));
          },
          { once: true },
        );
      });
    }

    const status = next.status ?? 200;
    const body = next.rawBody ?? JSON.stringify(next.body ?? {});
    const response: AxiosResponse<string> = {
      data: body,
      status,
      statusText: STATUS_TEXT[status] ?? '',
      headers: { 'content-type': next.rawBody ? 'text/plain' : 'application/json' },
      config,
      request: {},
    };
    return Promise.resolve(response);
  };

  httpClient.defaults.adapter = adapter;

  // `fetchMock` is kept in the return for backwards compatibility with any
  // future test that wants a callable spy; `calls` is what the suite reads.
  const fetchMock = vi.fn();
  return { fetchMock, calls };
}
