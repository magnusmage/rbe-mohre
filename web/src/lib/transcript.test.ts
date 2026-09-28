import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TranscriptEntry } from '@/types';
import { downloadTextFile, formatTranscriptAsText } from './transcript';

const SAMPLE: TranscriptEntry[] = [
  { who: 'Agent', time: '00:01', text: 'Hello.' },
  { who: 'Worker', time: '00:05', text: 'My pay was short.' },
];

describe('formatTranscriptAsText', () => {
  it('joins each turn as `time  Speaker: text`, one per line', () => {
    expect(formatTranscriptAsText(SAMPLE)).toBe('00:01  Agent: Hello.\n00:05  Worker: My pay was short.');
  });

  it('returns an empty string for an empty transcript', () => {
    expect(formatTranscriptAsText([])).toBe('');
  });
});

describe('downloadTextFile', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it('creates an anchor with the download filename and clicks it', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    let clickedAnchor: HTMLAnchorElement | null = null;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchor = this;
    });

    downloadTextFile({ name: 'transcript.txt', contents: 'hello' });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // The anchor tells the browser what to save the blob as.
    expect(clickedAnchor).not.toBeNull();
    expect(clickedAnchor!.download).toBe('transcript.txt');
    // The anchor must not linger in the document once the download has started.
    expect(clickedAnchor!.isConnected).toBe(false);
  });
});
