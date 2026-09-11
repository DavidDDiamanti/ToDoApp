import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './useNow';

const AT = (h: number, m: number, s = 0) => new Date(2026, 8, 11, h, m, s);

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('holds the same value until the next minute boundary', () => {
    vi.useFakeTimers({ now: AT(12, 0, 30) });
    const { result } = renderHook(() => useNow());
    const first = result.current;
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(result.current).toBe(first);
  });

  it('updates once the minute boundary passes', () => {
    vi.useFakeTimers({ now: AT(12, 0, 30) });
    const { result } = renderHook(() => useNow());
    expect(result.current.getTime()).toBe(AT(12, 0, 30).getTime());
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.getTime()).toBe(AT(12, 1, 0).getTime());
  });

  it('keeps ticking every minute after the first boundary', () => {
    vi.useFakeTimers({ now: AT(12, 0, 30) });
    const { result } = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(30_000 + 2 * 60_000);
    });
    expect(result.current.getTime()).toBe(AT(12, 3, 0).getTime());
  });

  it('clears the boundary timeout on unmount', () => {
    vi.useFakeTimers({ now: AT(12, 0, 30) });
    const { unmount } = renderHook(() => useNow());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the repeating interval on unmount', () => {
    vi.useFakeTimers({ now: AT(12, 0, 30) });
    const { unmount } = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
