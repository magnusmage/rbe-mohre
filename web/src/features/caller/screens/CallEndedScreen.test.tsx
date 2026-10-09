import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/app/routes';
import { makeStore, renderWithProviders } from '@/test/utils';
import type { TranscriptEntry } from '@/types';
import type { CallSessionState } from '../state/callSessionSlice';
import { CallEndedScreen } from './CallEndedScreen';

const SAMPLE_TRANSCRIPT: TranscriptEntry[] = [
  { who: 'Agent', time: '00:01', text: 'Hello, this call is recorded.' },
  { who: 'Worker', time: '00:12', text: 'My July pay was short.' },
];

const renderEnded = (state: Partial<CallSessionState> = {}) =>
  renderWithProviders(<CallEndedScreen />, {
    store: makeStore(state),
    route: ROUTES.callerEnded,
    extraRoutes: [{ path: ROUTES.callerReady, element: <div>start call screen</div> }],
  });

describe('CallEndedScreen', () => {
  it('shows the duration of the call that just finished', () => {
    renderEnded({ status: 'ended', durationSeconds: 125 });

    expect(screen.getByText(/call ended/i)).toHaveTextContent('02:05');
    expect(screen.getByText('Duration').nextElementSibling).toHaveTextContent('02:05');
  });

  it('formats a long call with hours', () => {
    renderEnded({ status: 'ended', durationSeconds: 3725 });
    expect(screen.getByText('Duration').nextElementSibling).toHaveTextContent('1:02:05');
  });

  it('falls back to the sample duration when opened without a finished call', () => {
    renderEnded();
    expect(screen.getByText('Duration').nextElementSibling).toHaveTextContent('04:12');
  });

  it('shows the review reference and lets the caller copy it', async () => {
    const { user } = renderEnded({ status: 'ended', durationSeconds: 10 });

    expect(screen.getByText('RV-2409-0031')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    // user-event supplies the clipboard in jsdom; read back what the page wrote.
    await expect(navigator.clipboard.readText()).resolves.toBe('RV-2409-0031');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('explains what happens next', () => {
    renderEnded();

    expect(screen.getByText('Transcript stored')).toBeInTheDocument();
    expect(screen.getByText('Specialist reviews')).toBeInTheDocument();
    expect(screen.getByText("You'll hear back")).toBeInTheDocument();
  });

  it('goes back to Start call rather than the finished call', async () => {
    const { user, location } = renderEnded({ status: 'ended', durationSeconds: 10 });

    await user.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(location()).toBe(ROUTES.callerReady));
  });

  it('offers a new call', async () => {
    const { user, location } = renderEnded({ status: 'ended', durationSeconds: 10 });

    await user.click(screen.getByRole('button', { name: 'New call' }));

    await waitFor(() => expect(location()).toBe(ROUTES.callerReady));
  });
});

describe('CallEndedScreen — transcript', () => {
  it('renders the transcript captured from the SDK during the call', () => {
    renderEnded({ status: 'ended', durationSeconds: 10, transcript: SAMPLE_TRANSCRIPT });

    expect(screen.getByText('Hello, this call is recorded.')).toBeInTheDocument();
    expect(screen.getByText('My July pay was short.')).toBeInTheDocument();
  });

  it('shows an empty-state note when no transcript was captured', () => {
    renderEnded({ status: 'ended', durationSeconds: 10, transcript: [] });

    expect(screen.getByText(/no transcript was captured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download transcript/i })).toBeDisabled();
  });
});

describe('CallEndedScreen — download transcript', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it('downloads a text file of the transcript when the user clicks Download', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    // Capture the raw parts handed to the Blob constructor, since jsdom's Blob
    // has no `.text()` we can read back and object-URL fetch is unavailable too.
    const OriginalBlob = window.Blob;
    const captured: { parts: BlobPart[]; type: string | undefined }[] = [];
    class SpyBlob extends OriginalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        captured.push({ parts: parts ?? [], type: options?.type });
      }
    }
    (window as unknown as { Blob: typeof Blob }).Blob = SpyBlob as unknown as typeof Blob;

    // The anchor click would otherwise navigate the jsdom window mid-test.
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      const { user } = renderEnded({ status: 'ended', durationSeconds: 10, transcript: SAMPLE_TRANSCRIPT });

      await user.click(screen.getByRole('button', { name: /download transcript/i }));

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(captured).toHaveLength(1);
      expect(captured[0].type).toContain('text/plain');
      const text = captured[0].parts.join('');
      expect(text).toContain('00:01  Agent: Hello, this call is recorded.');
      expect(text).toContain('00:12  Worker: My July pay was short.');
    } finally {
      (window as unknown as { Blob: typeof Blob }).Blob = OriginalBlob;
    }
  });

  it('does not download when there is no transcript to save', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    const { user } = renderEnded({ status: 'ended', durationSeconds: 10, transcript: [] });

    const button = screen.getByRole('button', { name: /download transcript/i });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
