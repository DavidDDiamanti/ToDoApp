import { create } from 'zustand';

export type SyncState = 'synced' | 'pending' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: string | null;
  set(state: SyncState, lastSyncAt?: string | null): void;
}

export function createSyncStatusStore() {
  return create<SyncStatus>()((set) => ({
    state: 'pending',
    lastSyncAt: null,
    set: (state, lastSyncAt) => set((s) => ({ state, lastSyncAt: lastSyncAt === undefined ? s.lastSyncAt : lastSyncAt })),
  }));
}

export const useSyncStatus = createSyncStatusStore();
