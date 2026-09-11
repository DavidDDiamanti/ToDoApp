import { describe, expect, it } from 'vitest';
import {
  MIN_GAP,
  canPlace,
  describePlacement,
  dropToPlacement,
  keyMovePlacement,
  parentKeyOf,
  placeTodo,
  sortOrderBetween,
} from './place';
import { buildChildrenMap } from './tree';
import { byId, mk } from '../test/fixtures';
import type { Patch, Todo } from '../types';

const NOW = '2026-09-10T12:00:00.000Z';
const find = (patches: Patch[], id: string) => patches.find((p) => p.id === id);

describe('sortOrderBetween', () => {
  it('returns 0 when there is neither a previous nor a next sibling', () => {
    expect(sortOrderBetween(undefined, undefined)).toBe(0);
  });
  it('returns next.sort_order - 1 when there is only a next sibling', () => {
    const next = mk('n', null, { sort_order: 4 });
    expect(sortOrderBetween(undefined, next)).toBe(3);
  });
  it('returns prev.sort_order + 1 when there is only a previous sibling', () => {
    const prev = mk('p', null, { sort_order: 4 });
    expect(sortOrderBetween(prev, undefined)).toBe(5);
  });
  it('returns the midpoint when both neighbours exist', () => {
    const prev = mk('p', null, { sort_order: 2 });
    const next = mk('n', null, { sort_order: 4 });
    expect(sortOrderBetween(prev, next)).toBe(3);
  });
});

describe('canPlace', () => {
  const all = byId(mk('a', null), mk('b', 'a'), mk('c', 'b'));
  const map = buildChildrenMap(Object.values(all));
  it('rejects placing an item under itself', () => {
    expect(canPlace(map, 'a', 'a')).toBe(false);
  });
  it('rejects placing an item under its own descendant', () => {
    expect(canPlace(map, 'a', 'c')).toBe(false);
  });
  it('allows placing under an unrelated parent or the top level', () => {
    expect(canPlace(map, 'c', 'a')).toBe(true);
    expect(canPlace(map, 'a', null)).toBe(true);
  });
});

describe('parentKeyOf', () => {
  it('returns the bucket key an item lives in, or undefined if absent', () => {
    const all = byId(mk('a', null), mk('b', 'a'));
    const map = buildChildrenMap(Object.values(all));
    expect(parentKeyOf(map, 'b')).toBe('a');
    expect(parentKeyOf(map, 'a')).toBeNull();
    expect(parentKeyOf(map, 'zzz')).toBeUndefined();
  });
});

describe('placeTodo', () => {
  it('computes a midpoint sort_order when inserting before a sibling, parent unchanged', () => {
    const all = byId(
      mk('a', null, { sort_order: 0 }),
      mk('b', null, { sort_order: 1 }),
      mk('c', null, { sort_order: 2 }),
    );
    const map = buildChildrenMap(Object.values(all));
    expect(placeTodo(all, map, 'c', { parentId: null, index: 1 }, NOW)).toEqual([
      { id: 'c', parent_id: null, sort_order: 0.5, updated_at: NOW },
    ]);
  });

  it('places an item at the end of an existing bucket under a new parent', () => {
    const all = byId(
      mk('t', null, { sort_order: 4 }),
      mk('t1', 't', { sort_order: 5 }),
      mk('x', null, { sort_order: 0 }),
    );
    const map = buildChildrenMap(Object.values(all));
    expect(placeTodo(all, map, 'x', { parentId: 't', index: 1 }, NOW)).toEqual([
      { id: 'x', parent_id: 't', sort_order: 6, updated_at: NOW },
    ]);
  });

  it('gives sort_order 0 to the first child of an empty parent', () => {
    const all = byId(mk('e', null), mk('x', null));
    const map = buildChildrenMap(Object.values(all));
    expect(placeTodo(all, map, 'x', { parentId: 'e', index: 0 }, NOW)).toEqual([
      { id: 'x', parent_id: 'e', sort_order: 0, updated_at: NOW },
    ]);
  });

  it('returns [] for an unknown id', () => {
    const all = byId(mk('a', null));
    const map = buildChildrenMap(Object.values(all));
    expect(placeTodo(all, map, 'zzz', { parentId: null, index: 0 }, NOW)).toEqual([]);
  });

  it('returns [] when placing an item under itself', () => {
    const all = byId(mk('a', null));
    const map = buildChildrenMap(Object.values(all));
    expect(placeTodo(all, map, 'a', { parentId: 'a', index: 0 }, NOW)).toEqual([]);
  });

  it('returns [] when placing an item under its own descendant', () => {
    const all = byId(mk('a', null), mk('b', 'a'));
    const map = buildChildrenMap(Object.values(all));
    expect(placeTodo(all, map, 'a', { parentId: 'b', index: 0 }, NOW)).toEqual([]);
  });

  it('returns [] when the item is already at that position', () => {
    const all = byId(
      mk('a', null, { sort_order: 0 }),
      mk('b', null, { sort_order: 1 }),
      mk('c', null, { sort_order: 2 }),
    );
    const map = buildChildrenMap(Object.values(all));
    expect(placeTodo(all, map, 'b', { parentId: null, index: 1 }, NOW)).toEqual([]);
  });

  it('renumbers the whole bucket when the gap falls under MIN_GAP', () => {
    const all = byId(
      mk('p', 'g', { sort_order: 0 }),
      mk('q', 'g', { sort_order: 5e-7 }),
      mk('g', null),
      mk('r', null, { sort_order: 0 }),
    );
    const map = buildChildrenMap(Object.values(all));
    expect(5e-7).toBeLessThan(MIN_GAP);
    const patches = placeTodo(all, map, 'r', { parentId: 'g', index: 1 }, NOW);
    for (const p of patches) {
      expect(p.updated_at).toBe(NOW);
      expect(Number.isInteger(p.sort_order)).toBe(true);
    }
    expect(find(patches, 'r')).toEqual({ id: 'r', parent_id: 'g', sort_order: 1, updated_at: NOW });
    expect(find(patches, 'q')).toEqual({ id: 'q', sort_order: 2, updated_at: NOW });
    expect(patches).toHaveLength(2);
  });

  it('clamps an out-of-range index to the end of the bucket', () => {
    const all = byId(
      mk('a', null, { sort_order: 0 }),
      mk('b', null, { sort_order: 1 }),
      mk('x', null, { sort_order: 9 }),
    );
    const map = buildChildrenMap(Object.values(all));
    expect(placeTodo(all, map, 'x', { parentId: null, index: 999 }, NOW)).toEqual([
      { id: 'x', parent_id: null, sort_order: 2, updated_at: NOW },
    ]);
  });
});

describe('dropToPlacement', () => {
  it('drops inside a target as its last child', () => {
    const all = byId(mk('t', null), mk('t1', 't', { sort_order: 0 }), mk('x', null));
    const map = buildChildrenMap(Object.values(all));
    expect(dropToPlacement(map, 'x', 't', 'inside')).toEqual({ parentId: 't', index: 1 });
  });

  it('drops before or after a target as its sibling', () => {
    const all = byId(mk('p', null), mk('a', 'p', { sort_order: 0 }), mk('b', 'p', { sort_order: 1 }), mk('x', null));
    const map = buildChildrenMap(Object.values(all));
    expect(dropToPlacement(map, 'x', 'a', 'before')).toEqual({ parentId: 'p', index: 0 });
    expect(dropToPlacement(map, 'x', 'a', 'after')).toEqual({ parentId: 'p', index: 1 });
  });

  it('excludes the dragged item from the computed index', () => {
    const all = byId(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    const map = buildChildrenMap(Object.values(all));
    expect(dropToPlacement(map, 'a', 'b', 'after')).toEqual({ parentId: null, index: 1 });
  });

  it('returns null when the target is the dragged item itself', () => {
    const all = byId(mk('a', null));
    const map = buildChildrenMap(Object.values(all));
    expect(dropToPlacement(map, 'a', 'a', 'before')).toBeNull();
  });

  it('returns null when the target is a descendant of the dragged item', () => {
    const all = byId(mk('a', null), mk('b', 'a'));
    const map = buildChildrenMap(Object.values(all));
    expect(dropToPlacement(map, 'a', 'b', 'before')).toBeNull();
  });

  it('uses the effective (bucket) parent for an orphaned target', () => {
    const all = byId(mk('o', 'ghost', { sort_order: 0 }), mk('x', null));
    const map = buildChildrenMap(Object.values(all));
    expect(dropToPlacement(map, 'x', 'o', 'after')).toEqual({ parentId: null, index: 1 });
  });

  it('returns null when the target id is not in the map', () => {
    const all = byId(mk('a', null));
    const map = buildChildrenMap(Object.values(all));
    expect(dropToPlacement(map, 'a', 'zzz', 'before')).toBeNull();
    expect(dropToPlacement(map, 'a', 'zzz', 'after')).toBeNull();
  });

  it('returns null for an inside drop on an unknown target', () => {
    const all = byId(mk('a', null));
    const map = buildChildrenMap(Object.values(all));
    expect(dropToPlacement(map, 'a', 'zzz', 'inside')).toBeNull();
  });
});

describe('keyMovePlacement', () => {
  const all = byId(
    mk('a', null, { sort_order: 0 }),
    mk('b', null, { sort_order: 1 }),
    mk('c', null, { sort_order: 2 }),
    mk('c1', 'c', { sort_order: 0 }),
    mk('a1', 'a', { sort_order: 0 }),
  );
  const map = buildChildrenMap(Object.values(all));

  it('up swaps with the previous sibling', () => {
    expect(keyMovePlacement(map, 'b', 'up')).toEqual({ parentId: null, index: 0 });
  });
  it('up is null at the top of the bucket', () => {
    expect(keyMovePlacement(map, 'a', 'up')).toBeNull();
  });
  it('down swaps with the next sibling', () => {
    expect(keyMovePlacement(map, 'b', 'down')).toEqual({ parentId: null, index: 2 });
  });
  it('down is null at the bottom of the bucket', () => {
    expect(keyMovePlacement(map, 'c', 'down')).toBeNull();
  });
  it('right nests under the previous sibling as its last child', () => {
    expect(keyMovePlacement(map, 'b', 'right')).toEqual({ parentId: 'a', index: 1 });
  });
  it('right is null when the item is already first', () => {
    expect(keyMovePlacement(map, 'a', 'right')).toBeNull();
  });
  it('left moves the item out to sit right after its current parent', () => {
    expect(keyMovePlacement(map, 'c1', 'left')).toEqual({ parentId: null, index: 3 });
  });
  it('left is null at the root', () => {
    expect(keyMovePlacement(map, 'a', 'left')).toBeNull();
  });
});

describe('describePlacement', () => {
  it('describes a move under a parent', () => {
    const all = byId(mk('a', null, { title: 'A' } as Partial<Todo>), mk('x', null, { title: 'X' } as Partial<Todo>));
    const map = buildChildrenMap(Object.values(all));
    expect(describePlacement(all, map, 'x', { parentId: 'a', index: 0 })).toBe('Moved X under A, position 1 of 1');
  });

  it('describes a move to the top level', () => {
    const all = byId(mk('a', null, { title: 'A' } as Partial<Todo>), mk('x', 'a', { title: 'X' } as Partial<Todo>));
    const map = buildChildrenMap(Object.values(all));
    expect(describePlacement(all, map, 'x', { parentId: null, index: 1 })).toBe('Moved X to the top level, position 2 of 2');
  });
});
