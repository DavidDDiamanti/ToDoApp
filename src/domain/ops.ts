import type { ColorName } from '../lib/colors';
import type { Patch, Todo } from '../types';
import { getAncestorIds, getDescendantIds, nextSortOrder, type ChildrenMap } from './tree';

export interface CreateInput {
  title: string;
  description?: string;
  due_date?: string | null;
  due_time?: string | null;
  color?: ColorName;
}

export function createTodo(input: CreateInput, parentId: string | null, map: ChildrenMap, userId: string, now: string, id: string): Todo {
  return {
    id,
    user_id: userId,
    parent_id: parentId,
    title: input.title.trim(),
    description: input.description ?? '',
    due_date: input.due_date ?? null,
    due_time: input.due_time ?? null,
    color: input.color ?? 'slate',
    completed: false,
    sort_order: nextSortOrder(map, parentId),
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
}

export function updateFields(id: string, fields: Partial<Pick<Todo, 'title' | 'description' | 'due_date' | 'due_time' | 'color'>>, now: string): Patch {
  return { id, ...fields, updated_at: now };
}

export function toggleComplete(byId: Record<string, Todo>, map: ChildrenMap, id: string, now: string): Patch[] {
  const target = byId[id];
  if (!target) return [];
  if (!target.completed) {
    const ids = [id, ...getDescendantIds(map, id)];
    return ids.filter((x) => !byId[x]?.completed).map((x) => ({ id: x, completed: true, updated_at: now }));
  }
  const ids = [id, ...getAncestorIds(byId, id)];
  return ids.filter((x) => byId[x]?.completed).map((x) => ({ id: x, completed: false, updated_at: now }));
}

export function deleteSubtree(map: ChildrenMap, id: string, now: string): Patch[] {
  return [id, ...getDescendantIds(map, id)].map((x) => ({ id: x, deleted_at: now, updated_at: now }));
}

export function deleteAndPromote(byId: Record<string, Todo>, map: ChildrenMap, id: string, now: string): Patch[] {
  const target = byId[id];
  if (!target) return [];
  const children = map.get(id) ?? [];
  const n = children.length;
  const promoted: Patch[] = children.map((c, i) => ({
    id: c.id,
    parent_id: target.parent_id,
    sort_order: target.sort_order + (i + 1) / (n + 1),
    updated_at: now,
  }));
  return [...promoted, { id, deleted_at: now, updated_at: now }];
}
