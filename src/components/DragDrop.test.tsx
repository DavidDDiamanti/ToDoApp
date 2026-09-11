import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { TodoTree } from './TodoTree';
import type { RectReader } from '../dnd/hitTest';
import { useDragStore } from '../dnd/dragStore';
import { useTodoStore } from '../store/todoStore';
import { mk } from '../test/fixtures';

const ROW = 44;
const TOPS: Record<string, number> = { a: 0, b: ROW, c: ROW * 2 };

/**
 * Stands in for `getBoundingClientRect`. A real box spans the element's whole
 * subtree, so an element that still contains other `[data-todo-id]` elements is
 * reported that much taller; only leaf row boxes are one row high.
 */
const getRect: RectReader = (el) => ({
  top: TOPS[el.dataset.todoId ?? ''] ?? 0,
  height: ROW * (el.querySelectorAll('[data-todo-id]').length + 1),
});

function seed(...todos: ReturnType<typeof mk>[]) {
  const s = useTodoStore.getState();
  s.reset();
  for (const t of todos) s.upsertTodo(t, false);
}

function seedFlat() {
  seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }), mk('c', null, { sort_order: 2 }));
}

function item(id: string) {
  return screen.getByRole('treeitem', { name: id });
}

function rootOrder() {
  return Object.values(useTodoStore.getState().todos)
    .filter((t) => t.parent_id === null)
    .sort((x, y) => x.sort_order - y.sort_order)
    .map((t) => t.id);
}

const LISTENERS = ['pointermove', 'pointerup', 'pointercancel', 'keydown'];

function counts(spy: MockInstance<(type: string, ...rest: never[]) => void>) {
  const out: Record<string, number> = {};
  for (const name of LISTENERS) out[name] = spy.mock.calls.filter((c) => c[0] === name).length;
  return out;
}

beforeEach(() => {
  useTodoStore.getState().reset();
  useDragStore.setState({ draggingId: null, indicator: null, announcement: { text: '', seq: 0 }, focusId: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pointer drag and drop', () => {
  it('marks the dragged row and shows an after indicator in a bottom band', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });

    expect(item('b')).toHaveAttribute('data-drop', 'after');
    expect(item('a')).toHaveAttribute('data-dragging', 'true');
    expect(screen.getByRole('tree')).toHaveAttribute('data-dragging', 'true');
  });

  it('reorders on pointer up, clears the indicator and announces the move', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 80 });

    const todos = useTodoStore.getState().todos;
    expect(rootOrder()).toEqual(['b', 'a', 'c']);
    expect(todos.a.sort_order).toBeGreaterThan(todos.b.sort_order);
    expect(todos.a.sort_order).toBeLessThan(todos.c.sort_order);
    expect(item('b')).not.toHaveAttribute('data-drop');
    expect(item('a')).not.toHaveAttribute('data-dragging');
    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
    expect(screen.getByRole('status').textContent?.trim()).toBe('Moved a to the top level, position 2 of 3');
  });

  it('nests the row when dropped in a middle band', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 66 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 66 });

    expect(useTodoStore.getState().todos.a.parent_id).toBe('b');
  });

  it('drops before the target in a top band', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 92 });

    expect(rootOrder()).toEqual(['b', 'a', 'c']);
    expect(useTodoStore.getState().todos.a.parent_id).toBeNull();
  });

  it('targets the nested row under the pointer, not its ancestor', () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', 'a', { sort_order: 0 }), mk('c', null, { sort_order: 1 }));
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move c' }), { button: 0, pointerId: 1, clientY: 90 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 66 });

    expect(item('b')).toHaveAttribute('data-drop', 'inside');
    expect(item('a')).not.toHaveAttribute('data-drop');
  });

  it('refuses to drop an item onto its own descendant', () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', 'a', { sort_order: 0 }), mk('c', null, { sort_order: 1 }));
    render(<TodoTree getRect={getRect} />);
    const before = useTodoStore.getState().todos;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 66 });

    expect(item('b')).not.toHaveAttribute('data-drop');
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 66 });
    expect(useTodoStore.getState().todos).toEqual(before);
  });

  it('aborts on pointer cancel without moving anything', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    const before = useTodoStore.getState().todos;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });
    fireEvent.pointerCancel(window, { pointerId: 1 });

    expect(useTodoStore.getState().todos).toEqual(before);
    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
    expect(item('b')).not.toHaveAttribute('data-drop');
  });

  it('aborts on Escape and ignores the pointer up that follows', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    const before = useTodoStore.getState().todos;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 80 });

    expect(useTodoStore.getState().todos).toEqual(before);
    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
  });

  it('removes every window listener it added after a drop', () => {
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 80 });

    expect(counts(add)).toEqual({ pointermove: 1, pointerup: 1, pointercancel: 1, keydown: 1 });
    expect(counts(remove)).toEqual(counts(add));
  });

  it('removes every window listener when it unmounts mid-drag', () => {
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });
    view.unmount();

    expect(counts(add)).toEqual({ pointermove: 1, pointerup: 1, pointercancel: 1, keydown: 1 });
    expect(counts(remove)).toEqual(counts(add));
  });

  it('notifies the drag store once for two moves inside the same band', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    let calls = 0;
    const unsubscribe = useDragStore.subscribe(() => {
      calls += 1;
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 82 });
    unsubscribe();

    expect(calls).toBe(1);
  });
});
