import type { TranscriptEntry } from '@/types';

/** Renders a transcript as plain text suitable for downloading (`hh:mm  Speaker: text`). */
export function formatTranscriptAsText(entries: TranscriptEntry[]): string {
  return entries.map((entry) => `${entry.time}  ${entry.who}: ${entry.text}`).join('\n');
}

interface DownloadOptions {
  /** Filename (without extension). */
  name: string;
  contents: string;
  mimeType?: string;
}

/**
 * Triggers a browser download for a text blob. Kept as a helper so the caller
 * doesn't need to know about the `URL.createObjectURL` / anchor-click dance and
 * so tests can stub a single spot.
 */
export function downloadTextFile({ name, contents, mimeType = 'text/plain;charset=utf-8' }: DownloadOptions): void {
  const blob = new Blob([contents], { type: mimeType });
  const href = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Release the object URL on the next tick so the click has time to start the download.
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }
}
