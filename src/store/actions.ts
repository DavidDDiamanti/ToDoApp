import { nowISO } from '../lib/dates';
import { createTodo, deleteAndPromote, deleteSubtree, toggleComplete, updateFields, type CreateInput } from '../domain/ops';
import { placeTodo, type Placement } from '../domain/place';
import { buildChildrenMap } from '../domain/tree';
import type { Todo } from '../types';
import { useTodoStore } from './todoStore';

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

export function moveTodoTo(id: string, target: Placement): void {
  const { s, map } = snapshot();
  s.applyPatches(placeTodo(s.todos, map, id, target, nowISO()));
}
