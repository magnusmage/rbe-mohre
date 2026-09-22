import { env } from '@/config/env';

export type ApiErrorKind = 'network' | 'timeout' | 'aborted' | 'http' | 'parse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Extracts a server-provided message from common error body shapes (`detail`, `message`, `error`). */
async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      for (const key of ['detail', 'message', 'error'] as const) {
        const value = (body as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) return value;
      }
    }
  } catch {
    // Non-JSON error body; fall through to the status text.
  }
  return response.statusText || null;
}

export async function apiGet<T>(path: string, { signal, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    let response: Response;
    try {
      response = await fetch(`${env.apiBaseUrl}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new ApiError('timeout', 'The request timed out.');
      if (controller.signal.aborted) throw new ApiError('aborted', 'The request was cancelled.');
      throw new ApiError('network', error instanceof Error ? error.message : 'Network request failed.');
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new ApiError('http', message ?? `Request failed with status ${response.status}.`, response.status);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError('parse', 'The server returned an invalid response.', response.status);
    }
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
