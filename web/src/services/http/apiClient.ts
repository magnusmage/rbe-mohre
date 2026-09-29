import axios, {
  AxiosError,
  AxiosHeaders,
  isAxiosError,
  isCancel,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  type Method,
} from 'axios';
import { env } from '@/config/env';

export type ApiErrorKind = 'network' | 'timeout' | 'aborted' | 'http' | 'parse';

// ---------------------------------------------------------------------------
// Reviewer token wiring
//
// Reviewer credentials only exist at runtime (specialist sign-in). The store
// registers a getter here so the HTTP layer can attach the Authorization
// header without importing the store (that would loop back through slices).
// The token is NEVER cached in a module-level string — every request reads it
// live so a Sign-out or session-storage clear takes effect immediately.
// ---------------------------------------------------------------------------

type TokenProvider = () => string | null;
type UnauthorizedHandler = () => void;

let reviewerTokenProvider: TokenProvider = () => null;
let unauthorizedHandler: UnauthorizedHandler = () => {};

export function setReviewerTokenProvider(provider: TokenProvider): void {
  reviewerTokenProvider = provider;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

/** Paths that require the reviewer bearer token; matched by prefix on the URL. */
const REVIEWER_PATH_PREFIXES = ['/review', '/audit'] as const;

function pathRequiresReviewerToken(url: string | undefined): boolean {
  if (!url) return false;
  // Strip the base URL if it's present, so we compare pathnames only.
  let path = url;
  const base = env.apiBaseUrl;
  if (base && path.startsWith(base)) path = path.slice(base.length);
  return REVIEWER_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
}

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

/**
 * Reviewer-token request interceptor. Attaches `Authorization: Bearer <token>`
 * to any request whose path is under `/review` or `/audit`, provided a token
 * is available. If no token is available for a reviewer path, the request is
 * cancelled with an ApiError rather than sent unauthenticated — the caller
 * gets a clear signal to re-prompt for sign-in instead of a 401 round-trip.
 * The token is read fresh per request via the registered provider, so nothing
 * caches it in module state.
 */
httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!pathRequiresReviewerToken(config.url)) return config;
  const token = reviewerTokenProvider();
  if (!token) {
    // Throwing from an interceptor rejects the promise before the network is touched.
    throw new ApiError('http', 'Reviewer sign-in required.', 401);
  }
  const headers = config.headers instanceof AxiosHeaders ? config.headers : new AxiosHeaders(config.headers);
  headers.set('Authorization', `Bearer ${token}`);
  config.headers = headers;
  return config;
});

/**
 * Reviewer-token response interceptor. A 401 on a reviewer endpoint means the
 * bearer we sent is no longer valid; drop it so the sign-in modal reappears
 * rather than each screen deciding independently how to handle it.
 */
httpClient.interceptors.response.use((response) => {
  if (response.status === 401 && pathRequiresReviewerToken(response.config.url)) {
    unauthorizedHandler();
  }
  return response;
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
