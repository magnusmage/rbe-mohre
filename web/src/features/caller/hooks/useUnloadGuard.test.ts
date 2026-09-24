import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { voiceAgent } from '@/services/voice/voiceAgent';
import { useUnloadGuard } from './useUnloadGuard';

vi.mock('@/services/voice/voiceAgent', () => ({
  // MOCK: the service is covered by its own tests; here we only assert it is called.
  voiceAgent: { end: vi.fn(async () => {}) },
}));

const endMock = vi.mocked(voiceAgent.end);

describe('useUnloadGuard', () => {
  it('warns the browser before unloading while a call is active', () => {
    renderHook(() => useUnloadGuard(true));

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
  });

  it('releases the session if the page goes away', () => {
    renderHook(() => useUnloadGuard(true));

    window.dispatchEvent(new Event('pagehide'));
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it('registers nothing while no call is active', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnloadGuard(false));

    const registered = addEventListener.mock.calls.map(([type]) => type);
    expect(registered).not.toContain('beforeunload');
    expect(registered).not.toContain('pagehide');

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(endMock).not.toHaveBeenCalled();
  });

  it('removes its listeners when the call ends', () => {
    const { rerender } = renderHook(({ active }) => useUnloadGuard(active), { initialProps: { active: true } });

    rerender({ active: false });
    window.dispatchEvent(new Event('pagehide'));
    expect(endMock).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', () => {
    const { unmount } = renderHook(() => useUnloadGuard(true));
    unmount();

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    window.dispatchEvent(new Event('pagehide'));

    expect(preventDefault).not.toHaveBeenCalled();
    expect(endMock).not.toHaveBeenCalled();
  });
});
