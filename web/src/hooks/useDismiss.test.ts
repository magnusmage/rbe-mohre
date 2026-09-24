import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDismiss } from './useDismiss';

function setup(active = true) {
  const inside = document.createElement('div');
  const outside = document.createElement('div');
  document.body.append(inside, outside);

  const onDismiss = vi.fn();
  const ref = { current: inside };
  const view = renderHook(({ isActive }) => useDismiss(ref, isActive, onDismiss), {
    initialProps: { isActive: active },
  });

  return { inside, outside, onDismiss, ...view };
}

const pointerDown = (target: Element) =>
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

describe('useDismiss', () => {
  it('dismisses on a pointer press outside the element', () => {
    const { outside, onDismiss } = setup();
    pointerDown(outside);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores presses inside the element', () => {
    const { inside, onDismiss } = setup();
    pointerDown(inside);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses on Escape', () => {
    const { onDismiss } = setup();
    escape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const { onDismiss } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('listens only while active', () => {
    const { outside, onDismiss } = setup(false);
    pointerDown(outside);
    escape();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('stops listening once it becomes inactive', () => {
    const { outside, onDismiss, rerender } = setup(true);
    rerender({ isActive: false });

    pointerDown(outside);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', () => {
    const { outside, onDismiss, unmount } = setup();
    unmount();

    pointerDown(outside);
    escape();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
