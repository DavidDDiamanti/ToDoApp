import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClickOutsideEditor } from './useClickOutsideEditor';
import { useUiStore } from '../store/uiStore';

beforeEach(() => {
  useUiStore.getState().reset();
});

describe('useClickOutsideEditor', () => {
  it('registers exactly one pointerdown listener on document and removes the same handler on unmount', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useClickOutsideEditor());

    const pointerdownAdds = add.mock.calls.filter((c) => c[0] === 'pointerdown');
    expect(pointerdownAdds).toHaveLength(1);
    const handler = pointerdownAdds[0][1];

    unmount();

    const pointerdownRemoves = remove.mock.calls.filter((c) => c[0] === 'pointerdown');
    expect(pointerdownRemoves).toHaveLength(1);
    expect(pointerdownRemoves[0][1]).toBe(handler);
  });

  it('is a no-op when no editor is open', () => {
    renderHook(() => useClickOutsideEditor());
    expect(useUiStore.getState().openEditor).toBeNull();

    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(useUiStore.getState().openEditor).toBeNull();
    expect(useUiStore.getState().pendingClose).toBeNull();
  });
});
