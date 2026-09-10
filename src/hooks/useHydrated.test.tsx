import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHydrated } from './useHydrated';
import { useTodoStore } from '../store/todoStore';

describe('useHydrated', () => {
  it('goes false while a rehydrate is in progress and true when it finishes', async () => {
    await useTodoStore.persist.rehydrate();
    const { result } = renderHook(() => useHydrated());
    await waitFor(() => expect(result.current).toBe(true));
    let pending: Promise<void> | undefined;
    act(() => {
      pending = useTodoStore.persist.rehydrate() as Promise<void>;
    });
    expect(result.current).toBe(false);
    await act(async () => {
      await pending;
    });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
