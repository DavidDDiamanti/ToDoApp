import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/**
 * The current time, refreshed on every minute boundary so time-dependent
 * display (overdue flags) flips without an interaction. A timeout lands on the
 * next whole minute, then an interval keeps step with it; both are cleared on
 * unmount.
 *
 * This is the single interval site for time display. `useSync` stays the only
 * sync interval; do not add another ticking timer for rendering.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval = 0;
    const untilBoundary = MINUTE_MS - (Date.now() % MINUTE_MS);
    const timeout = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    }, untilBoundary);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  return now;
}
