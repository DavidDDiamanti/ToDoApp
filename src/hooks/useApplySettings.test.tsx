import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApplySettings } from './useApplySettings';
import { useSettingsStore } from '../store/settingsStore';

/**
 * jsdom has no matchMedia. This stub exposes just the surface the hook uses and
 * hands back an `emit` that drives the captured `change` listener.
 */
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
      const event = { matches, media: mql.media };
      act(() => {
        for (const listener of [...listeners]) listener(event as MediaQueryListEvent);
      });
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function metaTags(): HTMLMetaElement[] {
  return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
}

function contents(): (string | null)[] {
  return metaTags().map((tag) => tag.getAttribute('content'));
}

function Probe() {
  const resolved = useApplySettings();
  return <span data-testid="resolved">{resolved}</span>;
}

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().reset();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-gap');
  for (const tag of metaTags()) tag.remove();
  for (const [content, media] of [
    ['#F7F8F4', '(prefers-color-scheme: light)'],
    ['#141A1F', '(prefers-color-scheme: dark)'],
  ]) {
    const tag = document.createElement('meta');
    tag.setAttribute('name', 'theme-color');
    tag.setAttribute('content', content);
    tag.setAttribute('media', media);
    document.head.append(tag);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const tag of metaTags()) tag.remove();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-gap');
});

describe('useApplySettings', () => {
  it('leaves the document element bare while both settings are on their defaults', () => {
    stubMatchMedia(false);
    render(<Probe />);

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.hasAttribute('data-gap')).toBe(false);
    expect(contents()).toEqual(['#F7F8F4', '#141A1F']);
  });

  it('mirrors an explicit theme onto data-theme and removes it again for system', () => {
    stubMatchMedia(false);
    render(<Probe />);

    act(() => {
      useSettingsStore.getState().setTheme('dark');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');

    act(() => {
      useSettingsStore.getState().setTheme('light');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => {
      useSettingsStore.getState().setTheme('system');
    });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('mirrors the gap onto data-gap, with medium as the absent default', () => {
    stubMatchMedia(false);
    render(<Probe />);

    act(() => {
      useSettingsStore.getState().setGap('large');
    });
    expect(document.documentElement.getAttribute('data-gap')).toBe('large');

    act(() => {
      useSettingsStore.getState().setGap('small');
    });
    expect(document.documentElement.getAttribute('data-gap')).toBe('small');

    act(() => {
      useSettingsStore.getState().setGap('medium');
    });
    expect(document.documentElement.hasAttribute('data-gap')).toBe(false);
  });

  it('paints both theme-color tags with the resolved background and restores them for system', () => {
    stubMatchMedia(false);
    render(<Probe />);

    act(() => {
      useSettingsStore.getState().setTheme('dark');
    });
    expect(contents()).toEqual(['#141A1F', '#141A1F']);

    act(() => {
      useSettingsStore.getState().setTheme('light');
    });
    expect(contents()).toEqual(['#F7F8F4', '#F7F8F4']);

    act(() => {
      useSettingsStore.getState().setTheme('system');
    });
    expect(contents()).toEqual(['#F7F8F4', '#141A1F']);
    expect(metaTags().map((tag) => tag.getAttribute('media'))).toEqual([
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ]);
  });

  it('re-resolves when the device theme changes while the setting is system', () => {
    const media = stubMatchMedia(false);
    render(<Probe />);
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');

    media.emit(true);
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    media.emit(false);
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
  });

  it('ignores the device theme once an override is in force', () => {
    const media = stubMatchMedia(false);
    render(<Probe />);

    act(() => {
      useSettingsStore.getState().setTheme('light');
    });
    media.emit(true);

    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(contents()).toEqual(['#F7F8F4', '#F7F8F4']);
  });

  it('treats a missing matchMedia as a light device', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<Probe />);

    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('drops the change listener on unmount', () => {
    const media = stubMatchMedia(false);
    const { unmount } = render(<Probe />);
    expect(media.listenerCount).toBe(1);

    unmount();
    expect(media.listenerCount).toBe(0);
  });
});
