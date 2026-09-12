import { useEffect, useRef, useState } from 'react';
import { resolveTheme, useSettingsStore } from '../store/settingsStore';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Must stay in step with --bg in src/design/tokens.css. */
const BACKGROUND: Record<'light' | 'dark', string> = { light: '#F7F8F4', dark: '#141A1F' };

interface ThemeColorTag {
  element: HTMLMetaElement;
  original: string;
}

/** jsdom and non-browser hosts have no matchMedia; those count as a light device. */
function darkQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(DARK_QUERY);
}

/**
 * Mirrors the persisted settings onto <html> (data-theme, data-gap) and onto the
 * theme-color meta tags, and returns the theme actually in force. This hook and the
 * bootstrap script in index.html are the only places that touch document.documentElement.
 */
export function useApplySettings(): 'light' | 'dark' {
  const theme = useSettingsStore((s) => s.theme);
  const gap = useSettingsStore((s) => s.gap);
  const [systemDark, setSystemDark] = useState(() => darkQuery()?.matches ?? false);
  const resolved = resolveTheme(theme, systemDark);
  const tags = useRef<ThemeColorTag[]>([]);

  useEffect(() => {
    const query = darkQuery();
    if (query === null) return;
    setSystemDark(query.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // The originals are the media-scoped colours authored in index.html; read them once,
  // before any effect below has had the chance to overwrite one.
  useEffect(() => {
    tags.current = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
      (element) => ({ element, original: element.getAttribute('content') ?? '' }),
    );
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (gap === 'medium') root.removeAttribute('data-gap');
    else root.setAttribute('data-gap', gap);
  }, [gap]);

  useEffect(() => {
    for (const tag of tags.current) {
      tag.element.setAttribute('content', theme === 'system' ? tag.original : BACKGROUND[resolved]);
    }
  }, [theme, resolved]);

  return resolved;
}
