import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Patch, Todo } from '../types';
import { idbStorage } from './storage';

export const STORE_VERSION = 2;

export interface PersistedTodoState {
  todos: Record<string, Todo>;
  dirty: string[];
  lastPulledAt: string | null;
  collapsed: Record<string, true>;
  hideCompleted: boolean;
}

export interface TodoState extends PersistedTodoState {
  applyPatches(patches: Patch[]): void;
  upsertTodo(todo: Todo, markDirty: boolean): void;
  clearDirty(ids: string[], seenUpdatedAt: Record<string, string>): void;
  setLastPulledAt(ts: string): void;
  toggleCollapsed(id: string): void;
  setHideCompleted(v: boolean): void;
  reset(): void;
}

const EMPTY: PersistedTodoState = { todos: {}, dirty: [], lastPulledAt: null, collapsed: {}, hideCompleted: false };

function addDirty(dirty: string[], ids: string[]): string[] {
  const set = new Set(dirty);
  for (const id of ids) set.add(id);
  return [...set];
}

type LegacyTodo = Omit<Todo, 'due_time'> & { due_time?: string | null };

interface LegacyPersistedTodoState extends Omit<PersistedTodoState, 'todos'> {
  todos: Record<string, LegacyTodo>;
}

export function migrateTodoState(persisted: unknown, _version: number): PersistedTodoState {
  const p = (persisted ?? {}) as Partial<LegacyPersistedTodoState>;
  const legacyTodos = p.todos ?? {};
  const todos: Record<string, Todo> = {};
  for (const [id, t] of Object.entries(legacyTodos)) {
    todos[id] = { ...t, due_time: t.due_time ?? null };
  }
  return {
    todos,
    dirty: p.dirty ?? [],
    lastPulledAt: p.lastPulledAt ?? null,
    collapsed: p.collapsed ?? {},
    hideCompleted: p.hideCompleted ?? false,
  };
}

export function createTodoStore(opts: { storage: StateStorage; name: string }) {
  return create<TodoState>()(
    persist(
      (set) => ({
        ...EMPTY,
        applyPatches: (patches) =>
          set((s) => {
            const todos = { ...s.todos };
            const touched: string[] = [];
            for (const p of patches) {
              const existing = todos[p.id];
              if (!existing) continue;
              todos[p.id] = { ...existing, ...p };
              touched.push(p.id);
            }
            return { todos, dirty: addDirty(s.dirty, touched) };
          }),
        upsertTodo: (todo, markDirty) =>
          set((s) => ({
            todos: { ...s.todos, [todo.id]: todo },
            dirty: markDirty ? addDirty(s.dirty, [todo.id]) : s.dirty,
          })),
        clearDirty: (ids, seen) =>
          set((s) => ({
            dirty: s.dirty.filter((id) => {
              if (!ids.includes(id)) return true;
              const current = s.todos[id]?.updated_at;
              const a = current === undefined ? NaN : Date.parse(current);
              const b = Date.parse(seen[id]);
              // Fall back to string equality when either side isn't a parseable
              // timestamp, so a non-ISO value still clears on an exact match.
              const unchanged = Number.isNaN(a) || Number.isNaN(b) ? current === seen[id] : a === b;
              return !unchanged;
            }),
          })),
        setLastPulledAt: (ts) => set({ lastPulledAt: ts }),
        toggleCollapsed: (id) =>
          set((s) => {
            const collapsed = { ...s.collapsed };
            if (collapsed[id]) delete collapsed[id];
            else collapsed[id] = true;
            return { collapsed };
          }),
        setHideCompleted: (v) => set({ hideCompleted: v }),
        reset: () => set({ ...EMPTY }),
      }),
      {
        name: opts.name,
        version: STORE_VERSION,
        storage: createJSONStorage(() => opts.storage),
        partialize: (s) => ({ todos: s.todos, dirty: s.dirty, lastPulledAt: s.lastPulledAt, collapsed: s.collapsed, hideCompleted: s.hideCompleted }),
        migrate: migrateTodoState,
      },
    ),
  );
}

export const useTodoStore = createTodoStore({ storage: idbStorage, name: 'todo-store:local' });

/** Point the persisted store at a per-user namespace and load it. */
export async function switchStoreUser(userId: string): Promise<void> {
  useTodoStore.getState().reset();
  useTodoStore.persist.setOptions({ name: `todo-store:${userId}` });
  await useTodoStore.persist.rehydrate();
}

/**
 * On sign-out: point persistence at a throwaway namespace, then clear memory.
 * Order matters: reset() persists on every set, so switching the namespace
 * first keeps the signed-out user's IndexedDB data (including unsynced dirty
 * rows) intact for their next sign-in.
 */
export function detachStoreForSignOut(): void {
  useTodoStore.persist.setOptions({ name: 'todo-store:signed-out' });
  useTodoStore.getState().reset();
}
