import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSystemDark } from './useSystemDark';

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    addEventListener(type: string, listener: (event: MediaQueryListEvent) => void) {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener(type: string, listener: (event: MediaQueryListEvent) => void) {
      if (type === 'change') listeners.delete(listener);
    },
  };
  vi.stubGlobal('matchMedia', () => mql);
  return {
    emit(matches: boolean) {
      mql.matches = matches;
      act(() => {
        for (const listener of [...listeners]) listener({ matches, media: mql.media } as MediaQueryListEvent);
      });
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSystemDark', () => {
  it('reads the device preference and follows its changes', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useSystemDark());
    expect(result.current).toBe(true);
    media.emit(false);
    expect(result.current).toBe(false);
  });

  it('subscribes once and unsubscribes on unmount', () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useSystemDark());
    expect(media.listenerCount).toBe(1);
    unmount();
    expect(media.listenerCount).toBe(0);
  });

  it('treats a host without matchMedia as a light device', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useSystemDark());
    expect(result.current).toBe(false);
  });
});
