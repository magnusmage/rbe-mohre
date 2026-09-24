import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDelayedFlag } from './useDelayedFlag';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDelayedFlag', () => {
  it('stays false until the delay has passed', () => {
    const { result } = renderHook(() => useDelayedFlag(true, 300));
    expect(result.current).toBe(false);

    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe(false);

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it('never turns true for an operation that finishes quickly', () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 300), {
      initialProps: { active: true },
    });

    act(() => void vi.advanceTimersByTime(100));
    rerender({ active: false });
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it('resets immediately when the operation ends', () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 300), {
      initialProps: { active: true },
    });

    act(() => void vi.advanceTimersByTime(300));
    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it('is false while inactive and schedules nothing', () => {
    const { result } = renderHook(() => useDelayedFlag(false));
    expect(result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer on unmount', () => {
    const { unmount } = renderHook(() => useDelayedFlag(true, 300));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
