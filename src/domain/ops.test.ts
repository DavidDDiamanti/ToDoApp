import { describe, expect, it } from 'vitest';
import { createTodo, deleteAndPromote, deleteSubtree, toggleComplete, updateFields } from './ops';
import { buildChildrenMap } from './tree';
import { byId, mk } from '../test/fixtures';
import type { Patch } from '../types';

const NOW = '2026-09-10T12:00:00.000Z';
const find = (patches: Patch[], id: string) => patches.find((p) => p.id === id);

describe('createTodo', () => {
  it('builds a full row with defaults and appends after its siblings', () => {
    const map = buildChildrenMap([mk('a', null, { sort_order: 3 })]);
    const t = createTodo({ title: 'Shop' }, null, map, 'u1', NOW, 'new-id');
    expect(t).toEqual({
      id: 'new-id', user_id: 'u1', parent_id: null, title: 'Shop', description: '', due_date: null, due_time: null,
      color: 'slate', completed: false, sort_order: 4, deleted_at: null, created_at: NOW, updated_at: NOW,
    });
  });
  it('trims the title and honours optional fields', () => {
    const t = createTodo({ title: '  Paint ', description: 'walls', due_date: '2026-10-01', color: 'red' }, 'p', new Map(), 'u1', NOW, 'x');
    expect(t.title).toBe('Paint');
    expect(t.parent_id).toBe('p');
    expect(t.color).toBe('red');
    expect(t.due_date).toBe('2026-10-01');
    expect(t.sort_order).toBe(0);
  });
  it('honours due_time', () => {
    const t = createTodo({ title: 'x', due_date: '2026-10-01', due_time: '09:30' }, null, new Map(), 'u1', NOW, 'x');
    expect(t.due_time).toBe('09:30');
  });
});

describe('updateFields', () => {
  it('returns a patch with the changed fields and a new updated_at', () => {
    expect(updateFields('a', { title: 'New', color: 'blue' }, NOW)).toEqual({ id: 'a', title: 'New', color: 'blue', updated_at: NOW });
  });
  it('updateFields accepts due_time', () => {
    expect(updateFields('a', { due_time: '08:00' }, NOW)).toEqual({ id: 'a', due_time: '08:00', updated_at: NOW });
  });
  it('clears due_time when due_date is cleared', () => {
    expect(updateFields('a', { due_date: null }, NOW)).toEqual({ id: 'a', due_date: null, due_time: null, updated_at: NOW });
  });
  it('clears a due_time supplied alongside a cleared due_date', () => {
    expect(updateFields('a', { due_date: null, due_time: '08:00' }, NOW)).toEqual({ id: 'a', due_date: null, due_time: null, updated_at: NOW });
  });
  it('leaves due_time alone when due_date is not part of the patch', () => {
    expect(updateFields('a', { title: 'New' }, NOW)).toEqual({ id: 'a', title: 'New', updated_at: NOW });
  });
});

describe('toggleComplete', () => {
  it('completes the item and every descendant that is not yet complete', () => {
    const all = byId(mk('a'), mk('b', 'a'), mk('c', 'b', { completed: true }), mk('s'));
    const patches = toggleComplete(all, buildChildrenMap(Object.values(all)), 'a', NOW);
    expect(patches.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(patches.every((p) => p.completed === true && p.updated_at === NOW)).toBe(true);
  });
  it('un-completes the item and every completed ancestor', () => {
    const all = byId(mk('a', null, { completed: true }), mk('b', 'a', { completed: false }), mk('c', 'b', { completed: true }), mk('d', 'c', { completed: true }));
    const patches = toggleComplete(all, buildChildrenMap(Object.values(all)), 'd', NOW);
    expect(patches.map((p) => p.id).sort()).toEqual(['a', 'c', 'd']);
    expect(patches.every((p) => p.completed === false)).toBe(true);
  });
  it('returns nothing for an unknown id', () => {
    expect(toggleComplete({}, new Map(), 'ghost', NOW)).toEqual([]);
  });
});

describe('deleteSubtree', () => {
  it('tombstones the item and all descendants, nothing else', () => {
    const map = buildChildrenMap([mk('a'), mk('b', 'a'), mk('c', 'b'), mk('s')]);
    const patches = deleteSubtree(map, 'a', NOW);
    expect(patches.map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
    expect(patches.every((p) => p.deleted_at === NOW && p.updated_at === NOW)).toBe(true);
  });
});

describe('deleteAndPromote', () => {
  it('re-parents children to the deleted item\'s parent in the slot where it sat, then tombstones it', () => {
    const all = byId(mk('root'), mk('mid', 'root', { sort_order: 2 }), mk('k1', 'mid', { sort_order: 0 }), mk('k2', 'mid', { sort_order: 1 }), mk('after', 'root', { sort_order: 3 }));
    const patches = deleteAndPromote(all, buildChildrenMap(Object.values(all)), 'mid', NOW);
    expect(find(patches, 'k1')).toEqual({ id: 'k1', parent_id: 'root', sort_order: 2 + 1 / 3, updated_at: NOW });
    expect(find(patches, 'k2')).toEqual({ id: 'k2', parent_id: 'root', sort_order: 2 + 2 / 3, updated_at: NOW });
    expect(find(patches, 'mid')).toEqual({ id: 'mid', deleted_at: NOW, updated_at: NOW });
    expect(patches).toHaveLength(3);
  });
  it('promotes to the top level when the deleted item was a root', () => {
    const all = byId(mk('a', null, { sort_order: 1 }), mk('k', 'a'));
    const patches = deleteAndPromote(all, buildChildrenMap(Object.values(all)), 'a', NOW);
    expect(find(patches, 'k')?.parent_id).toBeNull();
  });
});
