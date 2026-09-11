import { describe, expect, it } from 'vitest';
import { get } from 'idb-keyval';
import { createTodoStore, detachStoreForSignOut, migrateTodoState, STORE_VERSION, switchStoreUser, useTodoStore } from './todoStore';
import { createMemoryStorage } from './storage';
import { mk } from '../test/fixtures';

function fresh() {
  const storage = createMemoryStorage();
  const store = createTodoStore({ storage, name: 'test-store' });
  return { storage, store };
}

describe('todoStore', () => {
  it('applies patches to existing todos and marks them dirty', () => {
    const { store } = fresh();
    store.getState().upsertTodo(mk('a'), false);
    store.getState().applyPatches([{ id: 'a', title: 'Changed', updated_at: 'T2' }]);
    expect(store.getState().todos.a.title).toBe('Changed');
    expect(store.getState().todos.a.updated_at).toBe('T2');
    expect(store.getState().dirty).toEqual(['a']);
  });

  it('ignores patches for unknown ids and does not duplicate dirty ids', () => {
    const { store } = fresh();
    store.getState().upsertTodo(mk('a'), true);
    store.getState().applyPatches([{ id: 'ghost', updated_at: 'T' }, { id: 'a', updated_at: 'T3' }]);
    expect(store.getState().todos.ghost).toBeUndefined();
    expect(store.getState().dirty).toEqual(['a']);
  });

  it('clearDirty removes only ids whose updated_at matches the value seen at flush time', () => {
    const { store } = fresh();
    store.getState().upsertTodo(mk('a', null, { updated_at: 'T1' }), true);
    store.getState().upsertTodo(mk('b', null, { updated_at: 'T1' }), true);
    store.getState().applyPatches([{ id: 'b', updated_at: 'T2' }]);
    store.getState().clearDirty(['a', 'b'], { a: 'T1', b: 'T1' });
    expect(store.getState().dirty).toEqual(['b']);
  });

  it('clearDirty treats Z and +00:00 forms of the same instant as unchanged', () => {
    const { store } = fresh();
    store.getState().upsertTodo(mk('a', null, { updated_at: '2026-09-10T10:00:00+00:00' }), true);
    store.getState().clearDirty(['a'], { a: '2026-09-10T10:00:00.000Z' });
    expect(store.getState().dirty).toEqual([]);
  });

  it('persists state to storage and rehydrates it', async () => {
    const { storage, store } = fresh();
    store.getState().upsertTodo(mk('a'), true);
    store.getState().setHideCompleted(true);
    await new Promise((r) => setTimeout(r, 0));
    const again = createTodoStore({ storage, name: 'test-store' });
    await again.persist.rehydrate();
    expect(again.getState().todos.a.id).toBe('a');
    expect(again.getState().dirty).toEqual(['a']);
    expect(again.getState().hideCompleted).toBe(true);
  });

  it('toggleCollapsed and reset behave', () => {
    const { store } = fresh();
    store.getState().toggleCollapsed('a');
    expect(store.getState().collapsed).toEqual({ a: true });
    store.getState().toggleCollapsed('a');
    expect(store.getState().collapsed).toEqual({});
    store.getState().upsertTodo(mk('a'), true);
    store.getState().reset();
    expect(store.getState().todos).toEqual({});
    expect(store.getState().dirty).toEqual([]);
  });
});

describe('detachStoreForSignOut', () => {
  it('clears memory but leaves the signed-in user\'s persisted namespace untouched', async () => {
    await switchStoreUser('user-x');
    useTodoStore.getState().upsertTodo(mk('keep-me'), true);
    await new Promise((r) => setTimeout(r, 0));
    const before = await get<string>('todo-store:user-x');
    expect(before).toContain('keep-me');
    detachStoreForSignOut();
    await new Promise((r) => setTimeout(r, 0));
    expect(useTodoStore.getState().todos).toEqual({});
    expect(useTodoStore.getState().dirty).toEqual([]);
    const after = await get<string>('todo-store:user-x');
    expect(after).toContain('keep-me');
    expect(useTodoStore.persist.getOptions().name).toBe('todo-store:signed-out');
  });
});

describe('migrateTodoState', () => {
  it('fills missing fields when migrating from an older version', () => {
    const migrated = migrateTodoState({ todos: { a: mk('a') } }, 0);
    expect(migrated.dirty).toEqual([]);
    expect(migrated.lastPulledAt).toBeNull();
    expect(migrated.collapsed).toEqual({});
    expect(migrated.hideCompleted).toBe(false);
  });
  it('returns current-version state untouched', () => {
    const state = { todos: {}, dirty: ['x'], lastPulledAt: 'T', collapsed: { a: true as const }, hideCompleted: true };
    expect(migrateTodoState(state, STORE_VERSION)).toEqual(state);
  });
  it('adds due_time null to todos persisted before version 2', () => {
    const { due_time, ...legacy } = mk('a');
    void due_time;
    const migrated = migrateTodoState({ todos: { a: legacy } }, 1);
    expect(migrated.todos.a.due_time).toBeNull();
    expect(migrated.todos.a).toEqual({ ...legacy, due_time: null });
  });
  it('STORE_VERSION is 2', () => {
    expect(STORE_VERSION).toBe(2);
  });
});
