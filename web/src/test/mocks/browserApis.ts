import { vi } from 'vitest';

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
  /** Rejects the request (network failure). */
  networkError?: boolean;
  /** Never settles until the request is aborted, for timeout/abort cases. */
  hang?: boolean;
}

/**
 * MOCK — stands in for the RBE backend (`GET /session/signed-url` and friends).
 * Replace with: a contract test against a real staging backend, if that is ever wanted.
 */
export function stubFetch(responses: FetchStubResponse | FetchStubResponse[]) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls: { url: string; init?: RequestInit }[] = [];

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = queue.length > 1 ? queue.shift()! : queue[0];

    if (next.networkError) return Promise.reject(new TypeError('Failed to fetch'));

    if (next.hang) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }

    const body = next.rawBody ?? JSON.stringify(next.body ?? {});
    return Promise.resolve(
      new Response(body, {
        status: next.status ?? 200,
        headers: { 'Content-Type': next.rawBody ? 'text/plain' : 'application/json' },
      }),
    );
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}
