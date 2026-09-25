import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallTimer } from './useCallTimer';

const START = Date.parse('2026-09-24T10:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => vi.useRealTimers());

describe('useCallTimer', () => {
  it('reports zero before a call has started', () => {
    const { result } = renderHook(() => useCallTimer(null, true));
    expect(result.current).toBe(0);
  });

  it('starts at zero and ticks once a second while running', () => {
    const { result } = renderHook(() => useCallTimer(START, true));
    expect(result.current).toBe(0);

    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(1);

    act(() => void vi.advanceTimersByTime(4000));
    expect(result.current).toBe(5);
  });

  it('stays accurate when the tab was throttled and ticks were skipped', () => {
    const { result } = renderHook(() => useCallTimer(START, true));

    // Clock jumps 10s but only one tick fires, as a backgrounded tab behaves.
    act(() => {
      vi.setSystemTime(START + 10_000);
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(11);
  });

  it('does not run while the call is not live', () => {
    const setInterval = vi.spyOn(window, 'setInterval');
    const { result } = renderHook(() => useCallTimer(START, false));

    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
    expect(setInterval).not.toHaveBeenCalled();
  });

  it('freezes as soon as the call stops', () => {
    const { result, rerender } = renderHook(({ running }) => useCallTimer(START, running), {
      initialProps: { running: true },
    });

    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(3);

    rerender({ running: false });
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current).toBe(3);
  });

  it('keeps a single interval across re-renders', () => {
    const setInterval = vi.spyOn(window, 'setInterval');
    const { rerender } = renderHook(() => useCallTimer(START, true));

    rerender();
    rerender();
    expect(setInterval).toHaveBeenCalledTimes(1);
  });

  it('clears its interval on unmount', () => {
    const clearInterval = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderHook(() => useCallTimer(START, true));

    unmount();
    expect(clearInterval).toHaveBeenCalled();

    // Nothing is left to fire.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never reports a negative elapsed time if the clock moved backwards', () => {
    const { result } = renderHook(() => useCallTimer(START + 60_000, true));
    expect(result.current).toBe(0);
  });
});
