import { useSyncExternalStore } from 'react';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** jsdom and non-browser hosts have no matchMedia; those count as a light device. */
function darkQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(DARK_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const query = darkQuery();
  if (query === null) return () => undefined;
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return darkQuery()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

/** Whether the device prefers a dark colour scheme, live. One media query, read as an external store. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
