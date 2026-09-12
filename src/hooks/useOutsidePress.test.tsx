import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOutsidePress } from './useOutsidePress';
import { useUiStore } from '../store/uiStore';

beforeEach(() => {
  useUiStore.getState().reset();
});

describe('useOutsidePress', () => {
  it('registers exactly one pointerdown listener on document and removes the same handler on unmount', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useOutsidePress());

    const pointerdownAdds = add.mock.calls.filter((c) => c[0] === 'pointerdown');
    expect(pointerdownAdds).toHaveLength(1);
    const handler = pointerdownAdds[0][1];

    unmount();

    const pointerdownRemoves = remove.mock.calls.filter((c) => c[0] === 'pointerdown');
    expect(pointerdownRemoves).toHaveLength(1);
    expect(pointerdownRemoves[0][1]).toBe(handler);
  });

  it('is a no-op when no editor is open', () => {
    renderHook(() => useOutsidePress());
    expect(useUiStore.getState().openEditor).toBeNull();

    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(useUiStore.getState().openEditor).toBeNull();
    expect(useUiStore.getState().pendingClose).toBeNull();
  });

  it('clears the active item when a press lands outside every item body', () => {
    renderHook(() => useOutsidePress());
    act(() => {
      useUiStore.getState().setActive('a');
    });

    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });

    expect(useUiStore.getState().activeItemId).toBeNull();
  });

  it('leaves the active item alone when the press is inside an item body', () => {
    const body = document.createElement('div');
    body.setAttribute('data-item-body', '');
    const inner = document.createElement('button');
    body.append(inner);
    document.body.append(body);
    renderHook(() => useOutsidePress());
    act(() => {
      useUiStore.getState().setActive('a');
    });

    act(() => {
      inner.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });

    expect(useUiStore.getState().activeItemId).toBe('a');
    body.remove();
  });
});
