import { useEffect } from 'react';
import { syncEngine } from '../sync/engine';
import type { SyncEngine } from '../sync/syncEngine';
import { useAuthStore } from '../store/authStore';
import { useSyncStatus } from '../store/syncStatusStore';
import { useTodoStore } from '../store/todoStore';
import { useHydrated } from './useHydrated';

export const SYNC_INTERVAL_MS = 60_000;

/**
 * The single place that wires browser events to the sync engine. Mount once.
 *
 * Waits for the persisted store to finish rehydrating before starting the
 * engine: `switchStoreUser` (triggered from `authStore`'s `onUser`) points
 * the store at the signed-in user's namespace and rehydrates it, but that
 * happens asynchronously after `status` has already flipped to `signed_in`.
 * Starting the engine before rehydration finishes would let it read/flush
 * against the previous (wrong) namespace, so this hook gates on
 * `useHydrated()` in addition to `userId`.
 */
export function useSync(engine: SyncEngine = syncEngine): void {
  const userId = useAuthStore((s) => s.userId);
  const hydrated = useHydrated();

  useEffect(() => {
    if (!hydrated || !userId) return;
    engine.start(userId);
    void engine.sync();

    const onOnline = () => void engine.sync();
    const onOffline = () => useSyncStatus.getState().set('offline');
    const onVisible = () => {
      if (document.visibilityState === 'visible') void engine.sync();
    };
    const interval = window.setInterval(() => void engine.sync(), SYNC_INTERVAL_MS);
    const unsubDirty = useTodoStore.subscribe((s, prev) => {
      if (s.dirty !== prev.dirty && s.dirty.length > 0) void engine.sync();
    });

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(interval);
      unsubDirty();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      engine.stop();
      useSyncStatus.getState().set('pending', null);
    };
  }, [engine, userId, hydrated]);
}
