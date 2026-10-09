import { describe, expect, it } from 'vitest';
import { PROJECT_REPOSITORY } from '@/config/links';
import { ApiError } from '@/services/http/apiClient';
import { MicrophoneAccessError } from '@/services/media/microphone';
import { VoiceConnectionTimeoutError } from '@/services/voice/voiceAgent';
import { apiError, apiErrorMessage, connectionError, droppedCallError, microphoneError } from './callErrors';

describe('microphoneError', () => {
  it.each([
    ['denied', /blocked/i],
    ['not-found', /no microphone was found/i],
    ['in-use', /another application/i],
    ['insecure-context', /https/i],
    ['unsupported', /browser/i],
    ['unknown', /couldn't access your microphone/i],
  ] as const)('maps the %s code to its own message', (code, expected) => {
    const error = microphoneError(new MicrophoneAccessError(code));
    expect(error.source).toBe('microphone');
    expect(error.title).toBe('Microphone access needed');
    expect(error.message).toMatch(expected);
  });

  it('maps raw DOM exceptions thrown by getUserMedia', () => {
    expect(microphoneError(new DOMException('no', 'NotAllowedError')).message).toMatch(/blocked/i);
    expect(microphoneError(new DOMException('no', 'NotFoundError')).message).toMatch(/no microphone/i);
    expect(microphoneError(new DOMException('no', 'NotReadableError')).message).toMatch(/another application/i);
  });

  it('falls back to the unknown message for unrecognised errors', () => {
    expect(microphoneError(new Error('boom')).message).toMatch(/couldn't access your microphone/i);
  });
});

describe('apiErrorMessage', () => {
  it.each([
    [new ApiError('network', 'x'), /couldn't reach the call service/i],
    [new ApiError('timeout', 'x'), /took too long/i],
    [new ApiError('aborted', 'x'), /cancelled/i],
    [new ApiError('parse', 'x'), /unexpected response/i],
    [new ApiError('http', 'x', 500), /temporarily unavailable/i],
    [new ApiError('http', 'x', 503), /temporarily unavailable/i],
    [new ApiError('http', 'x', 401), /not authorised/i],
    [new ApiError('http', 'x', 403), /not authorised/i],
    [new ApiError('http', 'x', 429), /too many call attempts/i],
  ])('maps %s to a user-facing message', (error, expected) => {
    expect(apiErrorMessage(error)).toMatch(expected);
  });

  it('passes through a server message for other 4xx responses', () => {
    expect(apiErrorMessage(new ApiError('http', 'case already closed', 409))).toBe('case already closed');
  });

  it('falls back when the server sent no message', () => {
    expect(apiErrorMessage(new ApiError('http', '', 409))).toMatch(/couldn't start a call session/i);
  });

  it('falls back for non-ApiError values', () => {
    expect(apiErrorMessage(new Error('boom'))).toMatch(/couldn't start a call session/i);
    expect(apiErrorMessage('boom')).toMatch(/couldn't start a call session/i);
  });
});

describe('apiError', () => {
  it('shows the "deploy your own agent" guidance with a repository link for 502 signed_url_unavailable', () => {
    // The backend couldn't mint a signed URL (same root cause as the SDK quota
    // branch), so this card reads with the same demonstration-project copy.
    const error = apiError(new ApiError('http', 'signed_url_unavailable', 502));
    expect(error.message).toBe(
      'This is a demonstration project. To use the voice agent, deploy the preconfigured agent and tools from the /agent directory to your ElevenLabs workspace, replace account-specific placeholders (API key, agent/tool IDs, workspace secrets, and webhook credentials), and test the integration.',
    );
    expect(error.link).toEqual({ label: PROJECT_REPOSITORY.label, href: PROJECT_REPOSITORY.href });
  });

  it('does not use the demonstration-project copy for a 502 with a different detail', () => {
    const error = apiError(new ApiError('http', 'upstream_timeout', 502));
    expect(error.link).toBeUndefined();
    expect(error.message).toMatch(/temporarily unavailable/i);
    expect(error.message).not.toMatch(/demonstration project/i);
  });

  it('does not use that copy for signed_url_unavailable on another status', () => {
    const error = apiError(new ApiError('http', 'signed_url_unavailable', 500));
    expect(error.link).toBeUndefined();
    expect(error.message).not.toMatch(/demonstration project/i);
  });

  it('always reports the api source and title', () => {
    const error = apiError(new ApiError('network', 'x'));
    expect(error.source).toBe('api');
    expect(error.title).toBe("Voice Agent Configuration Required");
  });
});

describe('connectionError', () => {
  it('reports a timeout distinctly', () => {
    expect(connectionError(new VoiceConnectionTimeoutError()).message).toMatch(/took too long/i);
  });

  it('quotes the close reason when the agent closed the socket', () => {
    expect(connectionError({ closeReason: 'agent unavailable' }).message).toMatch(/agent unavailable/);
  });

  it('re-maps a microphone failure raised inside the SDK', () => {
    const error = connectionError(new DOMException('no', 'NotAllowedError'));
    expect(error.source).toBe('microphone');
  });

  it('falls back to a generic connection message', () => {
    const error = connectionError(new Error('socket closed'));
    expect(error.source).toBe('connection');
    expect(error.title).toBe("Couldn't connect to the assistant");
    expect(error.message).toMatch(/couldn't connect you/i);
  });

  it('ignores an empty close reason', () => {
    expect(connectionError({ closeReason: '' }).message).toMatch(/couldn't connect you/i);
  });

  it('shows the "deploy your own agent" guidance when the SDK reports quota_exceeded via closeReason', () => {
    // Shape of an ElevenLabs SessionConnectionError when the workspace quota
    // is gone: the WebSocket close carries a reason that mentions quota.
    const error = connectionError({
      name: 'SessionConnectionError',
      message: 'quota_exceeded',
      closeCode: 1008,
      closeReason: 'quota_exceeded',
    });
    expect(error.source).toBe('connection');
    expect(error.title).toMatch(/Configuration /i);
    // The exact copy the operator reads — never the raw server string.
    expect(error.message).toBe(
      'This is a demonstration project. To use the voice agent, deploy the preconfigured agent and tools from the /agent directory to your ElevenLabs workspace, replace account-specific placeholders (API key, agent/tool IDs, workspace secrets, and webhook credentials), and test the integration.',
    );
    expect(error.link).toEqual({ label: PROJECT_REPOSITORY.label, href: PROJECT_REPOSITORY.href });
    // And must NOT fall back to the generic close-reason echo.
    expect(error.message).not.toMatch(/the assistant ended the connection/i);
  });

  it('matches quota wording case-insensitively and in longer sentences', () => {
    // Covers minor wording variations ElevenLabs may send on the close frame.
    const variants = [
      'Quota exceeded',
      'This request exceeds your quota.',
      'insufficient_quota',
    ];
    for (const closeReason of variants) {
      expect(connectionError({ closeReason }).message).toMatch(/demonstration project/i);
    }
  });

  it('detects quota via `message` when `closeReason` is absent', () => {
    // Some SDK paths wrap the server detail into `message` without setting
    // `closeReason`; the detector must still fire.
    const error = connectionError(new Error('ElevenLabs: quota_exceeded'));
    expect(error.message).toMatch(/demonstration project/i);
    expect(error.title).toMatch(/Configuration /i);
  });

  it('does not misfire for unrelated close reasons', () => {
    // "quota" is the specific signal; other reasons must keep the existing echo.
    const error = connectionError({ closeReason: 'agent unavailable' });
    expect(error.message).toMatch(/agent unavailable/);
    expect(error.message).not.toMatch(/demonstration project/i);
    expect(error.link).toBeUndefined();
  });
});

describe('droppedCallError', () => {
  it('includes the SDK message when there is one', () => {
    const error = droppedCallError({ reason: 'error', message: 'socket closed', context: { type: 'websocket', code: 1006 } });
    expect(error.title).toBe('Call disconnected');
    expect(error.message).toMatch(/socket closed/);
    expect(error.message).toMatch(/start a new call/i);
  });

  it('reads cleanly without a message', () => {
    const error = droppedCallError({ reason: 'error', message: '', context: { type: 'websocket', code: 1006 } });
    expect(error.message).toBe('The call was interrupted. Please start a new call.');
  });
});
