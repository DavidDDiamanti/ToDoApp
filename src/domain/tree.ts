import type { Todo } from '../types';

export type ChildrenMap = Map<string | null, Todo[]>;

function bySortOrder(a: Todo, b: Todo): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  if (a.created_at < b.created_at) return -1;
  if (a.created_at > b.created_at) return 1;
  return 0;
}

/** Group live todos by parent. Orphans (missing or deleted parent) go under `null`. */
export function buildChildrenMap(todos: Iterable<Todo>): ChildrenMap {
  const live = new Map<string, Todo>();
  for (const t of todos) {
    if (t.deleted_at === null) live.set(t.id, t);
  }
  const map: ChildrenMap = new Map();
  for (const t of live.values()) {
    const key = t.parent_id !== null && live.has(t.parent_id) ? t.parent_id : null;
    const bucket = map.get(key);
    if (bucket) bucket.push(t);
    else map.set(key, [t]);
  }
  for (const bucket of map.values()) bucket.sort(bySortOrder);
  return map;
}

export function getDescendantIds(map: ChildrenMap, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  const stack: Todo[] = [...(map.get(id) ?? [])];
  while (stack.length > 0) {
    const t = stack.pop() as Todo;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t.id);
    const kids = map.get(t.id);
    if (kids) stack.push(...kids);
  }
  return out;
}

export function getAncestorIds(byId: Record<string, Todo>, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur = byId[id]?.parent_id ?? null;
  while (cur !== null && !seen.has(cur)) {
    const t = byId[cur];
    if (!t || t.deleted_at !== null) break;
    out.push(cur);
    seen.add(cur);
    cur = t.parent_id;
  }
  return out;
}

export function isDescendant(map: ChildrenMap, candidateId: string, ofId: string): boolean {
  return getDescendantIds(map, ofId).includes(candidateId);
}

export function nextSortOrder(map: ChildrenMap, parentId: string | null): number {
  const siblings = map.get(parentId);
  if (!siblings || siblings.length === 0) return 0;
  let max = -Infinity;
  for (const s of siblings) if (s.sort_order > max) max = s.sort_order;
  return max + 1;
}
