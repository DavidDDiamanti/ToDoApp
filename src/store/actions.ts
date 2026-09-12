import { nowISO } from '../lib/dates';
import { createTodo, deleteAndPromote, deleteSubtree, toggleComplete, updateFields, type CreateInput } from '../domain/ops';
import { placeTodo, type Placement } from '../domain/place';
import { buildChildrenMap } from '../domain/tree';
import type { Todo } from '../types';
import { useTodoStore } from './todoStore';
import { editorKindFor, useUiStore } from './uiStore';

let currentUserId = 'local';

export function setCurrentUserId(id: string): void {
  currentUserId = id;
}

export function getCurrentUserId(): string {
  return currentUserId;
}

function snapshot() {
  const s = useTodoStore.getState();
  return { s, map: buildChildrenMap(Object.values(s.todos)) };
}

export function addTodo(input: CreateInput, parentId: string | null): string {
  const { s, map } = snapshot();
  const todo = createTodo(input, parentId, map, currentUserId, nowISO(), crypto.randomUUID());
  s.upsertTodo(todo, true);
  return todo.id;
}

export function editTodo(id: string, fields: Partial<Pick<Todo, 'title' | 'description' | 'due_date' | 'due_time' | 'color'>>): void {
  useTodoStore.getState().applyPatches([updateFields(id, fields, nowISO())]);
}

export function toggleTodo(id: string): void {
  const { s, map } = snapshot();
  s.applyPatches(toggleComplete(s.todos, map, id, nowISO()));
}

export function removeTodo(id: string, mode: 'subtree' | 'promote'): void {
  const { s, map } = snapshot();
  const now = nowISO();
  s.applyPatches(mode === 'subtree' ? deleteSubtree(map, id, now) : deleteAndPromote(s.todos, map, id, now));
}

/** Returns true when the placement produced patches (i.e. the item actually moved). */
export function moveTodoTo(id: string, target: Placement): boolean {
  const { s, map } = snapshot();
  const patches = placeTodo(s.todos, map, id, target, nowISO());
  if (patches.length === 0) return false;
  s.applyPatches(patches);
  return true;
}

/**
 * Applies the close a prompt was asked for: the remembered next editor opens (or none), and a
 * remembered child editor is revealed under a collapsed parent just as a direct open would be.
 */
export function resolvePendingEditor(): void {
  const ui = useUiStore.getState();
  const next = ui.pendingClose?.next ?? null;
  ui.resolvePending();
  if (next !== null && next.kind === 'add') revealAdd(next.id);
}

/** Expands a collapsed parent whose child editor is open, so the editor is visible. */
export function revealAdd(id: string): void {
  if (editorKindFor(useUiStore.getState().openEditor, id) !== 'add') return;
  const { collapsed, toggleCollapsed } = useTodoStore.getState();
  if (collapsed[id] === true) toggleCollapsed(id);
}

/** Requests the child editor and, only if it really opened, reveals it under a collapsed parent. */
export function openAddUnder(id: string): void {
  useUiStore.getState().requestOpen({ kind: 'add', id });
  // requestOpen is a request: a discard prompt or a dirty editor can refuse it.
  revealAdd(id);
}
