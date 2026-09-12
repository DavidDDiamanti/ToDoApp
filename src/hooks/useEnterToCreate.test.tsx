import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEnterToCreate } from './useEnterToCreate';
import { useUiStore } from '../store/uiStore';

beforeEach(() => {
  useUiStore.getState().reset();
});

describe('useEnterToCreate', () => {
  it('registers exactly one keydown listener on document and removes the same handler on unmount', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useEnterToCreate());

    const keydownAdds = add.mock.calls.filter((c) => c[0] === 'keydown');
    expect(keydownAdds).toHaveLength(1);
    const handler = keydownAdds[0][1];

    unmount();

    const keydownRemoves = remove.mock.calls.filter((c) => c[0] === 'keydown');
    expect(keydownRemoves).toHaveLength(1);
    expect(keydownRemoves[0][1]).toBe(handler);
  });
});
