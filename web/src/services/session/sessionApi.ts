import { ApiError, apiGet } from '@/services/http/apiClient';

/** Response of `GET /session/signed-url`. Accepts snake_case and camelCase keys. */
interface SignedUrlResponse {
  signed_url?: unknown;
  signedUrl?: unknown;
}

/** Fetches a short-lived ElevenLabs signed WebSocket URL for a new voice session. */
export async function getSignedUrl(signal?: AbortSignal): Promise<string> {
  const data = await apiGet<SignedUrlResponse>('/session/signed-url', { signal });
  const url = data?.signed_url ?? data?.signedUrl;

  if (typeof url !== 'string' || !/^wss?:\/\//i.test(url)) {
    throw new ApiError('parse', 'The session service did not return a valid signed URL.');
  }
  return url;
}
