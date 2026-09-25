import { describe, expect, it } from 'vitest';
import { formatDuration } from './time';

describe('formatDuration', () => {
  it('formats sub-minute and minute durations as mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(9)).toBe('00:09');
    expect(formatDuration(59)).toBe('00:59');
    expect(formatDuration(60)).toBe('01:00');
    expect(formatDuration(252)).toBe('04:12');
  });

  it('adds an hours segment past 60 minutes', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(12.9)).toBe('00:12');
  });

  it('treats negative and non-finite input as zero', () => {
    expect(formatDuration(-5)).toBe('00:00');
    expect(formatDuration(Number.NaN)).toBe('00:00');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});
