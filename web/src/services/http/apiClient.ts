import axios, {
  AxiosError,
  AxiosHeaders,
  isAxiosError,
  isCancel,
  type AxiosRequestConfig,
  type AxiosResponse,
  type Method,
} from 'axios';
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
  /** Extra request headers merged over the defaults (e.g. `Authorization`). */
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Shared Axios instance for every JSON call the console makes.
 *
 * - `transformResponse: []` keeps the response body as raw text so we JSON.parse
 *   it ourselves; this lets us return `parse` errors for a broken body and read
 *   error messages out of `{ detail | message | error }` shapes uniformly.
 * - `validateStatus: () => true` lets us map HTTP errors through the same
 *   pipeline as everything else, instead of Axios throwing before we can.
 */
export const httpClient = axios.create({
  baseURL: env.apiBaseUrl,
  headers: { Accept: 'application/json' },
  timeout: DEFAULT_TIMEOUT_MS,
  transformResponse: [(data: unknown) => data],
  validateStatus: () => true,
});

/** Extracts a server-provided message from common error body shapes (`detail`, `message`, `error`). */
function readErrorMessage(rawBody: unknown): string | null {
  if (typeof rawBody !== 'string' || !rawBody.trim()) return null;
  try {
    const body: unknown = JSON.parse(rawBody);
    if (body && typeof body === 'object') {
      for (const key of ['detail', 'message', 'error'] as const) {
        const value = (body as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) return value;
      }
    }
  } catch {
    // Non-JSON error body; fall through to the status text.
  }
  return null;
}

function toApiError(err: unknown, fallbackStatus: number | null = null): ApiError {
  if (err instanceof ApiError) return err;
  if (isCancel(err)) return new ApiError('aborted', 'The request was cancelled.');
  if (isAxiosError(err)) {
    const axErr = err as AxiosError;
    if (axErr.code === 'ECONNABORTED' || axErr.code === 'ETIMEDOUT') {
      return new ApiError('timeout', 'The request timed out.');
    }
    return new ApiError('network', axErr.message || 'Network request failed.', fallbackStatus);
  }
  return new ApiError('network', err instanceof Error ? err.message : 'Network request failed.', fallbackStatus);
}

async function request<T>(method: Method, path: string, options: RequestOptions, data?: unknown): Promise<T> {
  // Own abort listener so callers get parity with the pre-Axios contract:
  // the listener is always removed once the request settles, even on success.
  const onCallerAbort = () => {};
  options.signal?.addEventListener('abort', onCallerAbort);

  const headers = new AxiosHeaders({ Accept: 'application/json' });
  if (options.headers) headers.set(options.headers);

  const config: AxiosRequestConfig = {
    url: path,
    method,
    headers,
    data,
    signal: options.signal,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    responseType: 'text',
  };

  let response: AxiosResponse<string>;
  try {
    response = await httpClient.request<string>(config);
  } catch (err) {
    throw toApiError(err);
  } finally {
    options.signal?.removeEventListener('abort', onCallerAbort);
  }

  if (response.status >= 400) {
    const message =
      readErrorMessage(response.data) ??
      response.statusText ??
      `Request failed with status ${response.status}.`;
    throw new ApiError('http', message || `Request failed with status ${response.status}.`, response.status);
  }

  const raw = response.data;
  if (raw === undefined || raw === null || raw === '') return undefined as T;
  try {
    return JSON.parse(raw as string) as T;
  } catch {
    throw new ApiError('parse', 'The server returned an invalid response.', response.status);
  }
}

export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>('GET', path, options);
}

export async function apiPost<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  return request<T>('POST', path, options, body);
}
