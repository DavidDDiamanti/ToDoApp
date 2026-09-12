import { useEffect, useRef } from 'react';
import { resolveTheme, useSettingsStore } from '../store/settingsStore';
import { useSystemDark } from './useSystemDark';

/** Must stay in step with --bg in src/design/tokens.css. */
const BACKGROUND: Record<'light' | 'dark', string> = { light: '#F7F8F4', dark: '#141A1F' };

interface ThemeColorTag {
  element: HTMLMetaElement;
  original: string;
}

/**
 * Mirrors the persisted settings onto <html> (data-theme, data-gap) and onto the
 * theme-color meta tags, and returns the theme actually in force. This hook and the
 * bootstrap script in index.html are the only places that touch document.documentElement.
 */
export function useApplySettings(): 'light' | 'dark' {
  const theme = useSettingsStore((s) => s.theme);
  const gap = useSettingsStore((s) => s.gap);
  const systemDark = useSystemDark();
  const resolved = resolveTheme(theme, systemDark);
  const tags = useRef<ThemeColorTag[]>([]);

  // The originals are the media-scoped colours authored in index.html; read them once,
  // before any effect below has had the chance to overwrite one. StrictMode re-runs mount
  // effects after the repaint effect has already run, so the ref guards against re-reading.
  useEffect(() => {
    if (tags.current.length > 0) return;
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
