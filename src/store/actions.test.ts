import { beforeEach, describe, expect, it } from 'vitest';
import { addTodo, editTodo, moveTodoTo, removeTodo, setCurrentUserId, toggleTodo } from './actions';
import { useTodoStore } from './todoStore';

beforeEach(() => {
  useTodoStore.getState().reset();
  setCurrentUserId('u1');
});

describe('actions', () => {
  it('addTodo creates a dirty row owned by the current user', () => {
    const id = addTodo({ title: 'Shop' }, null);
    const t = useTodoStore.getState().todos[id];
    expect(t.title).toBe('Shop');
    expect(t.user_id).toBe('u1');
    expect(useTodoStore.getState().dirty).toEqual([id]);
  });

  it('toggleTodo cascades completion to children', () => {
    const p = addTodo({ title: 'P' }, null);
    const c = addTodo({ title: 'C' }, p);
    toggleTodo(p);
    expect(useTodoStore.getState().todos[c].completed).toBe(true);
    toggleTodo(c);
    expect(useTodoStore.getState().todos[p].completed).toBe(false);
  });

  it('removeTodo with promote re-parents children, with subtree tombstones them', () => {
    const p = addTodo({ title: 'P' }, null);
    const c = addTodo({ title: 'C' }, p);
    removeTodo(p, 'promote');
    expect(useTodoStore.getState().todos[c].parent_id).toBeNull();
    expect(useTodoStore.getState().todos[p].deleted_at).not.toBeNull();
    const q = addTodo({ title: 'Q' }, null);
    const d = addTodo({ title: 'D' }, q);
    removeTodo(q, 'subtree');
    expect(useTodoStore.getState().todos[d].deleted_at).not.toBeNull();
  });

  it('editTodo and moveTodoTo patch the row', () => {
    const a = addTodo({ title: 'A' }, null);
    const b = addTodo({ title: 'B' }, null);
    editTodo(a, { title: 'A2', color: 'blue' });
    moveTodoTo(b, a);
    expect(useTodoStore.getState().todos[a].title).toBe('A2');
    expect(useTodoStore.getState().todos[b].parent_id).toBe(a);
  });
});
