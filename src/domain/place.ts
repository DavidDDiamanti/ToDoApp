import type { Patch, Todo } from '../types';
import { isDescendant, type ChildrenMap } from './tree';

export interface Placement {
  parentId: string | null;
  index: number; // index into the target bucket WITHOUT the moved item
}

export type DropZone = 'before' | 'inside' | 'after';
export type MoveKey = 'up' | 'down' | 'left' | 'right';

export const MIN_GAP = 1e-6;

export function sortOrderBetween(prev: Todo | undefined, next: Todo | undefined): number {
  if (prev === undefined) return next === undefined ? 0 : next.sort_order - 1;
  if (next === undefined) return prev.sort_order + 1;
  return (prev.sort_order + next.sort_order) / 2;
}

/** The bucket key (parent id, or null for root) an item currently lives under. `undefined` if it isn't in the map. */
export function parentKeyOf(map: ChildrenMap, id: string): string | null | undefined {
  for (const [key, bucket] of map) {
    if (bucket.some((t) => t.id === id)) return key;
  }
  return undefined;
}

/** False when placing `id` under `parentId` would put it under itself or one of its own descendants. */
export function canPlace(map: ChildrenMap, id: string, parentId: string | null): boolean {
  if (parentId === id) return false;
  if (parentId === null) return true;
  return !isDescendant(map, parentId, id);
}

export function placeTodo(byId: Record<string, Todo>, map: ChildrenMap, id: string, target: Placement, now: string): Patch[] {
  const item = byId[id];
  if (!item) return [];
  if (!canPlace(map, id, target.parentId)) return [];

  const siblings = (map.get(target.parentId) ?? []).filter((t) => t.id !== id);
  const index = Math.min(Math.max(target.index, 0), siblings.length);
  const prev = siblings[index - 1];
  const next = siblings[index];

  if (prev !== undefined && next !== undefined && next.sort_order - prev.sort_order < MIN_GAP) {
    const ordered = [...siblings.slice(0, index), item, ...siblings.slice(index)];
    const patches: Patch[] = [];
    ordered.forEach((t, i) => {
      if (t.id === id) {
        patches.push({ id, parent_id: target.parentId, sort_order: i, updated_at: now });
      } else if (t.sort_order !== i) {
        patches.push({ id: t.id, sort_order: i, updated_at: now });
      }
    });
    return patches;
  }

  const sortOrder = sortOrderBetween(prev, next);
  if (target.parentId === item.parent_id && sortOrder === item.sort_order) return [];
  return [{ id, parent_id: target.parentId, sort_order: sortOrder, updated_at: now }];
}

export function dropToPlacement(map: ChildrenMap, draggedId: string, targetId: string, zone: DropZone): Placement | null {
  if (targetId === draggedId || isDescendant(map, targetId, draggedId)) return null;
  if (parentKeyOf(map, targetId) === undefined) return null;

  if (zone === 'inside') {
    const bucket = (map.get(targetId) ?? []).filter((t) => t.id !== draggedId);
    return { parentId: targetId, index: bucket.length };
  }

  const parentId = parentKeyOf(map, targetId) ?? null;
  const siblings = (map.get(parentId) ?? []).filter((t) => t.id !== draggedId);
  const targetIndex = siblings.findIndex((t) => t.id === targetId);
  if (targetIndex === -1) return null;
  const index = zone === 'after' ? targetIndex + 1 : targetIndex;
  return { parentId, index };
}

/**
 * Where an Alt+arrow move should land. `isVisible` filters the siblings a move
 * may step over, so a keyboard move never jumps a row the reader cannot see
 * (completed rows while "hide completed" is on).
 */
export function keyMovePlacement(
  map: ChildrenMap,
  id: string,
  key: MoveKey,
  isVisible: (t: Todo) => boolean = () => true,
): Placement | null {
  const parentId = parentKeyOf(map, id);
  if (parentId === undefined) return null;
  const siblings = map.get(parentId) ?? [];
  const i = siblings.findIndex((t) => t.id === id);
  if (i === -1) return null;

  /** Index of the nearest visible sibling before `i`, or -1. */
  const previousVisible = (): number => {
    for (let j = i - 1; j >= 0; j -= 1) if (isVisible(siblings[j])) return j;
    return -1;
  };

  if (key === 'up') {
    const j = previousVisible();
    return j === -1 ? null : { parentId, index: j };
  }
  if (key === 'down') {
    for (let k = i + 1; k < siblings.length; k += 1) {
      if (isVisible(siblings[k])) return { parentId, index: k };
    }
    return null;
  }
  if (key === 'right') {
    const j = previousVisible();
    if (j === -1) return null;
    const p = siblings[j];
    const bucket = (map.get(p.id) ?? []).filter((t) => t.id !== id);
    return { parentId: p.id, index: bucket.length };
  }

  // left
  if (parentId === null) return null;
  const grandParentId = parentKeyOf(map, parentId) ?? null;
  const grandSiblings = map.get(grandParentId) ?? [];
  const parentIndex = grandSiblings.findIndex((t) => t.id === parentId);
  return { parentId: grandParentId, index: parentIndex + 1 };
}

export function describePlacement(byId: Record<string, Todo>, map: ChildrenMap, id: string, target: Placement): string {
  const title = byId[id]?.title ?? '';
  const siblings = (map.get(target.parentId) ?? []).filter((t) => t.id !== id);
  const n = siblings.length + 1;
  const index = Math.min(Math.max(target.index, 0), siblings.length);
  const position = index + 1;
  return target.parentId === null
    ? `Moved ${title} to the top level, position ${position} of ${n}`
    : `Moved ${title} under ${byId[target.parentId]?.title ?? ''}, position ${position} of ${n}`;
}
