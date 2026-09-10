import type { createTodoStore } from '../store/todoStore';
import type { createSyncStatusStore } from '../store/syncStatusStore';
import type { Todo } from '../types';

export function newerThan(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b);
}

/** Last-write-wins with a dirty-local guard. */
export function mergeRemote(local: Todo | undefined, localDirty: boolean, remote: Todo): Todo {
  if (local && localDirty && newerThan(local.updated_at, remote.updated_at)) return local;
  return remote;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function overlapSince(lastPulledAt: string | null, overlapMs = 60_000): string {
  const t = lastPulledAt === null ? NaN : Date.parse(lastPulledAt);
  if (Number.isNaN(t)) return new Date(0).toISOString();
  return new Date(t - overlapMs).toISOString();
}

export function maxUpdatedAt(rows: Todo[], current: string | null): string | null {
  const parsedCurrent = current === null ? NaN : Date.parse(current);
  let best: number | null = Number.isNaN(parsedCurrent) ? null : parsedCurrent;
  for (const r of rows) {
    const t = Date.parse(r.updated_at);
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) best = t;
  }
  if (rows.length === 0) return current;
  if (best === null) return null;
  return new Date(best).toISOString();
}

export interface TodoRemote {
  upsert(rows: Todo[]): Promise<void>;
  fetchSince(sinceISO: string): Promise<Todo[]>;
  subscribe(userId: string, onRow: (row: Todo) => void, onStatus: (status: string) => void): () => void;
}

export interface SyncEngine {
  start(userId: string): void;
  stop(): void;
  sync(): Promise<void>;
  isRunning(): boolean;
}

type TodoStore = ReturnType<typeof createTodoStore>;
type StatusStore = ReturnType<typeof createSyncStatusStore>;

export const FLUSH_CHUNK = 200;

export function createSyncEngine(remote: TodoRemote, store: TodoStore, status: StatusStore): SyncEngine {
  let userId: string | null = null;
  let unsubscribe: (() => void) | null = null;
  let inFlight: Promise<void> | null = null;

  function applyRemoteRow(row: Todo): void {
    const s = store.getState();
    const merged = mergeRemote(s.todos[row.id], s.dirty.includes(row.id), row);
    if (merged === row) s.upsertTodo(row, false);
  }

  async function flushDirty(): Promise<void> {
    const s = store.getState();
    const seen: Record<string, string> = {};
    const rows: Todo[] = [];
    for (const id of s.dirty) {
      const t = s.todos[id];
      if (!t) continue;
      seen[id] = t.updated_at;
      rows.push(t);
    }
    for (const group of chunk(rows, FLUSH_CHUNK)) {
      await remote.upsert(group);
      store.getState().clearDirty(group.map((r) => r.id), seen);
    }
  }

  async function pullSince(): Promise<void> {
    const since = overlapSince(store.getState().lastPulledAt);
    const rows = await remote.fetchSince(since);
    for (const row of rows) applyRemoteRow(row);
    const next = maxUpdatedAt(rows, store.getState().lastPulledAt);
    if (next !== null) store.getState().setLastPulledAt(next);
  }

  async function run(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      status.getState().set('offline');
      return;
    }
    if (store.getState().dirty.length > 0) status.getState().set('pending');
    try {
      await flushDirty();
      await pullSince();
      const stillDirty = store.getState().dirty.length > 0;
      status.getState().set(stillDirty ? 'pending' : 'synced', new Date().toISOString());
    } catch {
      status.getState().set('error');
    }
  }

  function stop(): void {
    unsubscribe?.();
    unsubscribe = null;
    userId = null;
  }

  function sync(): Promise<void> {
    if (userId === null) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function start(uid: string): void {
    if (userId === uid && unsubscribe) return;
    stop();
    userId = uid;
    unsubscribe = remote.subscribe(uid, applyRemoteRow, (channelStatus) => {
      if (channelStatus === 'SUBSCRIBED') void sync();
    });
  }

  function isRunning(): boolean {
    return userId !== null;
  }

  return { start, stop, sync, isRunning };
}
