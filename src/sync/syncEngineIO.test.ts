import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncEngine, type TodoRemote } from './syncEngine';
import { createTodoStore } from '../store/todoStore';
import { createMemoryStorage } from '../store/storage';
import { createSyncStatusStore } from '../store/syncStatusStore';
import { mk } from '../test/fixtures';
import type { Todo } from '../types';

function fakeRemote(serverRows: Todo[] = []) {
  const upserts: Todo[][] = [];
  let onRow: ((row: Todo) => void) | null = null;
  let onStatus: ((s: string) => void) | null = null;
  const remote: TodoRemote = {
    upsert: vi.fn(async (rows) => { upserts.push(rows); }),
    fetchSince: vi.fn(async (since) => serverRows.filter((r) => Date.parse(r.updated_at) > Date.parse(since))),
    subscribe: vi.fn((_uid, row, status) => { onRow = row; onStatus = status; return () => { onRow = null; }; }),
  };
  return { remote, upserts, pushRow: (r: Todo) => onRow?.(r), pushStatus: (s: string) => onStatus?.(s) };
}

function harness(serverRows: Todo[] = []) {
  const store = createTodoStore({ storage: createMemoryStorage(), name: 'sync-test' });
  const status = createSyncStatusStore();
  const f = fakeRemote(serverRows);
  const engine = createSyncEngine(f.remote, store, status);
  return { store, status, engine, ...f };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createSyncEngine', () => {
  it('flushes dirty rows in chunks of 200 and clears them on success', async () => {
    const { store, engine, remote, upserts } = harness();
    for (let i = 0; i < 250; i += 1) store.getState().upsertTodo(mk(`t${i}`), true);
    engine.start('u1');
    await engine.sync();
    expect(remote.upsert).toHaveBeenCalledTimes(2);
    expect(upserts[0]).toHaveLength(200);
    expect(upserts[1]).toHaveLength(50);
    expect(store.getState().dirty).toEqual([]);
  });

  it('keeps rows dirty when the upsert fails and marks status error', async () => {
    const { store, engine, remote, status } = harness();
    (remote.upsert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));
    store.getState().upsertTodo(mk('a'), true);
    engine.start('u1');
    await engine.sync();
    expect(store.getState().dirty).toEqual(['a']);
    expect(status.getState().state).toBe('error');
  });

  it('keeps a row dirty if it was edited during the flush', async () => {
    const { store, engine, remote } = harness();
    store.getState().upsertTodo(mk('a', null, { updated_at: 'T1' }), true);
    (remote.upsert as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      store.getState().applyPatches([{ id: 'a', title: 'edited', updated_at: 'T2' }]);
    });
    engine.start('u1');
    await engine.sync();
    expect(store.getState().dirty).toEqual(['a']);
  });

  it('pulls rows newer than lastPulledAt minus the overlap, merges them, and advances lastPulledAt', async () => {
    const old = mk('old', null, { updated_at: '2026-09-10T09:00:00.000Z' });
    const fresh = mk('fresh', null, { updated_at: '2026-09-10T10:00:00.000Z' });
    const { store, engine, remote } = harness([old, fresh]);
    store.getState().setLastPulledAt('2026-09-10T09:30:00.000Z');
    engine.start('u1');
    await engine.sync();
    expect(remote.fetchSince).toHaveBeenCalledWith('2026-09-10T09:29:00.000Z');
    expect(store.getState().todos.fresh).toBeDefined();
    expect(store.getState().todos.old).toBeUndefined();
    expect(store.getState().lastPulledAt).toBe('2026-09-10T10:00:00.000Z');
    expect(store.getState().dirty).toEqual([]);
  });

  it('pulls from the epoch on first sync', async () => {
    const { engine, remote } = harness();
    engine.start('u1');
    await engine.sync();
    expect(remote.fetchSince).toHaveBeenCalledWith('1970-01-01T00:00:00.000Z');
  });

  it('merges realtime rows and does not overwrite newer dirty local edits', () => {
    const { store, engine, pushRow } = harness();
    engine.start('u1');
    store.getState().upsertTodo(mk('a', null, { title: 'mine', updated_at: '2026-09-10T10:00:09.000Z' }), true);
    pushRow(mk('a', null, { title: 'theirs', updated_at: '2026-09-10T10:00:05.000Z' }));
    pushRow(mk('b', null, { title: 'new remote', updated_at: '2026-09-10T10:00:05.000Z' }));
    expect(store.getState().todos.a.title).toBe('mine');
    expect(store.getState().todos.b.title).toBe('new remote');
    expect(store.getState().dirty).toEqual(['a']);
  });

  it('re-syncs when the channel reports SUBSCRIBED and stops cleanly', async () => {
    const { engine, remote, pushStatus } = harness();
    engine.start('u1');
    pushStatus('SUBSCRIBED');
    await new Promise((r) => setTimeout(r, 0));
    expect(remote.fetchSince).toHaveBeenCalled();
    engine.stop();
    expect(engine.isRunning()).toBe(false);
  });

  it('does not run two syncs at once', async () => {
    const { engine, remote } = harness();
    engine.start('u1');
    await Promise.all([engine.sync(), engine.sync()]);
    expect(remote.fetchSince).toHaveBeenCalledTimes(1);
  });
});
