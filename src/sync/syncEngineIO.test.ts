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

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

  it('ignores the result of a pull that finishes after stop()', async () => {
    const { store, engine, remote } = harness();
    const d = deferred<Todo[]>();
    (remote.fetchSince as ReturnType<typeof vi.fn>).mockReturnValueOnce(d.promise);
    engine.start('u1');
    const running = engine.sync();
    engine.stop();
    d.resolve([mk('late', null, { updated_at: '2026-09-10T10:00:00.000Z' })]);
    await running;
    expect(store.getState().todos.late).toBeUndefined();
    expect(store.getState().lastPulledAt).toBeNull();
  });

  it('runs once more after a sync requested during an in-flight run', async () => {
    const { store, engine, remote } = harness();
    const d = deferred<void>();
    (remote.upsert as ReturnType<typeof vi.fn>).mockReturnValueOnce(d.promise);
    store.getState().upsertTodo(mk('a'), true);
    engine.start('u1');
    const first = engine.sync();
    store.getState().upsertTodo(mk('b'), true);
    const second = engine.sync();
    d.resolve();
    await first;
    await second;
    await new Promise((r) => setTimeout(r, 0));
    expect(remote.upsert).toHaveBeenCalledTimes(2);
    expect(store.getState().dirty).toEqual([]);
  });

  it('still pulls when the flush fails', async () => {
    const fresh = mk('fresh', null, { updated_at: '2026-09-10T10:00:00.000Z' });
    const { store, engine, remote, status } = harness([fresh]);
    (remote.upsert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));
    store.getState().upsertTodo(mk('a'), true);
    engine.start('u1');
    await engine.sync();
    expect(store.getState().todos.fresh).toBeDefined();
    expect(store.getState().dirty).toEqual(['a']);
    expect(status.getState().state).toBe('error');
  });

  it('ignores realtime rows from a previous subscription after a user switch', () => {
    const { store, engine, remote } = harness();
    engine.start('u1');
    const firstOnRow = (remote.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1] as (row: Todo) => void;
    engine.stop();
    engine.start('u2');
    firstOnRow(mk('stale', null, { updated_at: '2026-09-10T10:00:00.000Z' }));
    expect(store.getState().todos.stale).toBeUndefined();
  });

  it('lets the next user sync while a stopped run is still in flight', async () => {
    const { engine, remote } = harness();
    const d = deferred<Todo[]>();
    (remote.fetchSince as ReturnType<typeof vi.fn>).mockReturnValueOnce(d.promise);
    engine.start('u1');
    const old = engine.sync();
    engine.stop();
    engine.start('u2');
    const fresh = engine.sync();
    // Let both `run()`s reach their post-flush generation check. The old run's
    // captured generation no longer matches (two stop()/start() calls bumped
    // it), so it bails out before ever calling fetchSince; only the fresh run
    // for 'u2' does. Hence 1, not 2, at this checkpoint.
    await new Promise((r) => setTimeout(r, 0));
    expect(remote.fetchSince).toHaveBeenCalledTimes(1);
    d.resolve([]);
    await old;
    await fresh;
    await engine.sync();
    // The third sync() starts a genuine new run (inFlight was cleared after
    // `fresh` settled), adding one more fetchSince call: 2 total, not 3 -
    // the stale 'old' run never contributes a call.
    expect(remote.fetchSince).toHaveBeenCalledTimes(2);
  });

  it('does not clear dirty rows when an upsert resolves after stop()', async () => {
    const { store, engine, remote, status } = harness();
    const d = deferred<void>();
    (remote.upsert as ReturnType<typeof vi.fn>).mockReturnValueOnce(d.promise);
    store.getState().upsertTodo(mk('a'), true);
    engine.start('u1');
    const running = engine.sync();
    engine.stop();
    d.resolve();
    await running;
    expect(store.getState().dirty).toEqual(['a']);
    expect(status.getState().state).toBe('pending');
  });
});
