import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockClipboard } from '@/test/mocks/browserApis';
import { useCopyToClipboard } from './useCopyToClipboard';

afterEach(() => vi.useRealTimers());

describe('useCopyToClipboard', () => {
  it('copies the text and reports success', async () => {
    const writeText = mockClipboard();
    const { result } = renderHook(() => useCopyToClipboard());

    await act(() => result.current.copy('RV-2409-0031'));

    expect(writeText).toHaveBeenCalledWith('RV-2409-0031');
    expect(result.current.copied).toBe(true);
  });

  it('clears the copied flag after the reset delay', async () => {
    mockClipboard();
    vi.useFakeTimers();
    const { result } = renderHook(() => useCopyToClipboard(1000));

    await act(() => result.current.copy('x'));
    expect(result.current.copied).toBe(true);

    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.copied).toBe(false);
  });

  it('stays unconfirmed when the browser refuses', async () => {
    mockClipboard(true);
    const { result } = renderHook(() => useCopyToClipboard());

    await act(() => result.current.copy('x'));
    await waitFor(() => expect(result.current.copied).toBe(false));
  });

  it('clears its reset timer on unmount', async () => {
    mockClipboard();
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useCopyToClipboard());

    await act(() => result.current.copy('x'));
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
