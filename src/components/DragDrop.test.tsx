import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { TodoTree } from './TodoTree';
import type { RectReader } from '../dnd/hitTest';
import { useDragStore } from '../dnd/dragStore';
import { useTodoStore } from '../store/todoStore';
import { useUiStore } from '../store/uiStore';
import { mk } from '../test/fixtures';
import { pressTitle } from '../test/press';

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

function seedNested() {
  seed(mk('a', null, { sort_order: 0 }), mk('b', 'a', { sort_order: 0 }), mk('c', null, { sort_order: 1 }));
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

const LISTENERS = ['pointermove', 'pointerup', 'pointercancel', 'keydown', 'blur'];
const SURFACE_LISTENERS = [...LISTENERS, 'touchmove', 'click'];

type ListenerSpy = MockInstance<(type: string, ...rest: never[]) => void>;

function counts(spy: ListenerSpy, names: string[] = LISTENERS) {
  const out: Record<string, number> = {};
  for (const name of names) out[name] = spy.mock.calls.filter((c) => c[0] === name).length;
  return out;
}

/** The handler passed for each event name, in call order, so pairs can be compared by identity. */
function handlers(spy: ListenerSpy) {
  const out: Record<string, unknown[]> = {};
  for (const name of LISTENERS) out[name] = spy.mock.calls.filter((c) => c[0] === name).map((c) => c[1]);
  return out;
}

beforeEach(() => {
  useTodoStore.getState().reset();
  useDragStore.setState({ draggingId: null, indicator: null, announcement: { text: '', seq: 0 }, focusId: null });
  useUiStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
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
    seedNested();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move c' }), { button: 0, pointerId: 1, clientY: 90 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 66 });

    expect(item('b')).toHaveAttribute('data-drop', 'inside');
    expect(item('a')).not.toHaveAttribute('data-drop');
  });

  it('refuses to drop an item onto its own descendant', () => {
    seedNested();
    render(<TodoTree getRect={getRect} />);
    const before = useTodoStore.getState().todos;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 66 });

    expect(item('b')).not.toHaveAttribute('data-drop');
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 66 });
    expect(useTodoStore.getState().todos).toEqual(before);
  });

  it('announces a refused drop and leaves the store alone', () => {
    seedNested();
    render(<TodoTree getRect={getRect} />);
    const before = useTodoStore.getState().todos;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 66 });

    expect(screen.getByRole('status').textContent?.trim()).toBe('Cannot move a here');
    expect(useTodoStore.getState().todos).toEqual(before);
  });

  it('stays silent when released over its own row, as a plain click on the grip does', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    const before = useTodoStore.getState().todos;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 12 });

    expect(screen.getByRole('status').textContent?.trim()).toBe('');
    expect(useTodoStore.getState().todos).toEqual(before);
    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
  });

  it('expands a collapsed destination row when an item is dropped onto it', () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }), mk('bc', 'b', { sort_order: 0 }));
    act(() => {
      useTodoStore.getState().toggleCollapsed('b');
    });
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 66 });

    expect(useTodoStore.getState().todos.a.parent_id).toBe('b');
    expect(useTodoStore.getState().collapsed.b).toBeFalsy();
    expect(item('a')).toBeInTheDocument();
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

  it('aborts on Escape, swallows the key and ignores the pointer up that follows', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    const before = useTodoStore.getState().todos;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });

    expect(fireEvent.keyDown(window, { key: 'Escape' })).toBe(false);
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 80 });

    expect(useTodoStore.getState().todos).toEqual(before);
    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
  });

  it('ends the session when a mouse move reports no buttons pressed', () => {
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    render(<TodoTree getRect={getRect} />);
    const before = useTodoStore.getState().todos;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80, pointerType: 'mouse', buttons: 0 });

    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
    expect(item('b')).not.toHaveAttribute('data-drop');
    expect(useTodoStore.getState().todos).toEqual(before);
    expect(counts(remove)).toEqual(counts(add));
  });

  it('ends the session when the window loses focus', () => {
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    render(<TodoTree getRect={getRect} />);
    const before = useTodoStore.getState().todos;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });
    fireEvent.blur(window);

    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
    expect(item('b')).not.toHaveAttribute('data-drop');
    expect(useTodoStore.getState().todos).toEqual(before);
    expect(counts(remove)).toEqual(counts(add));
  });

  it('starts no session from a right button pointer down', () => {
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 2, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });

    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
    expect(item('b')).not.toHaveAttribute('data-drop');
    expect(counts(add)).toEqual({ pointermove: 0, pointerup: 0, pointercancel: 0, keydown: 0, blur: 0 });
  });

  it('ignores moves that belong to another pointer', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 2, clientY: 80 });

    expect(item('b')).not.toHaveAttribute('data-drop');
    expect(screen.getByRole('tree')).toHaveAttribute('data-dragging', 'true');
  });

  it('does not retarget the session when a second pointer goes down', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move c' }), { button: 0, pointerId: 2, clientY: 90 });

    expect(item('a')).toHaveAttribute('data-dragging', 'true');
    expect(item('c')).not.toHaveAttribute('data-dragging');

    fireEvent.pointerUp(window, { pointerId: 1, clientY: 80 });
    expect(rootOrder()).toEqual(['b', 'a', 'c']);
  });

  it('removes every window listener it added after a drop', () => {
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 80 });

    expect(counts(add)).toEqual({ pointermove: 1, pointerup: 1, pointercancel: 1, keydown: 1, blur: 1 });
    expect(counts(remove)).toEqual(counts(add));
    expect(handlers(remove)).toEqual(handlers(add));
  });

  it('removes every window listener when it unmounts mid-drag', () => {
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });
    view.unmount();

    expect(counts(add)).toEqual({ pointermove: 1, pointerup: 1, pointercancel: 1, keydown: 1, blur: 1 });
    expect(counts(remove)).toEqual(counts(add));
    expect(handlers(remove)).toEqual(handlers(add));
  });

  it("does not start a drag while the item's editor is open", async () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    await pressTitle('a');
    await userEvent.click(screen.getByRole('button', { name: 'Edit a' }));
    expect(screen.getByRole('form', { name: 'Edit a' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), { button: 0, pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 80 });

    expect(item('a')).not.toHaveAttribute('data-dragging');
    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
    expect(item('b')).not.toHaveAttribute('data-drop');
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

/** The title button, whatever state its details are in. */
function titleOf(id: string) {
  return (
    screen.queryByRole('button', { name: `Show details for ${id}` }) ??
    screen.getByRole('button', { name: `Hide details for ${id}` })
  );
}

const MOUSE_DOWN = { button: 0, pointerId: 1, clientX: 100, clientY: 10, pointerType: 'mouse' } as const;
const TOUCH_DOWN = { button: 0, pointerId: 1, clientX: 100, clientY: 10, pointerType: 'touch' } as const;

function mouseMove(clientY: number) {
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY, pointerType: 'mouse', buttons: 1 });
}

function mouseUp(clientY: number) {
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY, pointerType: 'mouse' });
}

function fakeClock() {
  vi.useFakeTimers();
  // A whole minute boundary keeps the shared clock's own timeout a full minute away.
  vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
}

describe('dragging from the item surface', () => {
  it('starts a mouse drag past 6 px and swallows the click that follows the drop', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(titleOf('a'), MOUSE_DOWN);
    mouseMove(12);

    expect(item('a')).not.toHaveAttribute('data-dragging');

    mouseMove(20);
    expect(item('a')).toHaveAttribute('data-dragging', 'true');

    mouseMove(80);
    expect(item('b')).toHaveAttribute('data-drop', 'after');

    mouseUp(80);
    expect(rootOrder()).toEqual(['b', 'a', 'c']);

    fireEvent.click(titleOf('a'));
    expect(titleOf('a')).toHaveAttribute('aria-expanded', 'false');
    expect(useUiStore.getState().activeItemId).toBeNull();
  });

  it('leaves a press and release without movement as an ordinary click', () => {
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(titleOf('a'), MOUSE_DOWN);
    mouseUp(10);

    expect(item('a')).not.toHaveAttribute('data-dragging');
    expect(counts(add, SURFACE_LISTENERS).click).toBe(0);

    fireEvent.click(titleOf('a'));
    expect(titleOf('a')).toHaveAttribute('aria-expanded', 'true');
    expect(useUiStore.getState().activeItemId).toBe('a');
  });

  it('abandons a pending touch drag when the finger moves before the hold completes', () => {
    fakeClock();
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(titleOf('a'), TOUCH_DOWN);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 20, pointerType: 'touch' });

    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');

    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 80, pointerType: 'touch' });

    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
    expect(item('b')).not.toHaveAttribute('data-drop');
  });

  it('starts a touch drag after a 350 ms hold, blocks scrolling and reorders on release', () => {
    fakeClock();
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(titleOf('a'), TOUCH_DOWN);

    expect(item('a')).not.toHaveAttribute('data-dragging');

    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(item('a')).toHaveAttribute('data-dragging', 'true');

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 80, pointerType: 'touch' });
    expect(item('b')).toHaveAttribute('data-drop', 'after');
    expect(window.dispatchEvent(new Event('touchmove', { bubbles: true, cancelable: true }))).toBe(false);

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 80, pointerType: 'touch' });
    expect(rootOrder()).toEqual(['b', 'a', 'c']);

    fireEvent.click(titleOf('a'));
    expect(counts(add, SURFACE_LISTENERS).touchmove).toBe(1);
    expect(counts(remove, SURFACE_LISTENERS)).toEqual(counts(add, SURFACE_LISTENERS));
  });

  it('does not drag from the checkbox, the chevron or an action button', async () => {
    seedNested();
    render(<TodoTree getRect={getRect} />);

    const expectNoDragFrom = (el: Element) => {
      fireEvent.pointerDown(el, MOUSE_DOWN);
      mouseMove(80);
      expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
      mouseUp(80);
    };

    expectNoDragFrom(screen.getByRole('checkbox', { name: 'Mark a complete' }));
    expectNoDragFrom(screen.getByRole('button', { name: 'Collapse a' }));
    await pressTitle('c');
    expectNoDragFrom(screen.getByRole('button', { name: 'Edit c' }));
    expect(rootOrder()).toEqual(['a', 'c']);
  });

  it('starts a drag from the details block', async () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    await pressTitle('a');
    fireEvent.pointerDown(screen.getByText('No description yet.'), MOUSE_DOWN);
    mouseMove(80);

    expect(item('a')).toHaveAttribute('data-dragging', 'true');

    mouseUp(80);
    expect(rootOrder()).toEqual(['b', 'a', 'c']);
  });

  it('keeps the grip starting a drag at pointer down with no movement', () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move a' }), MOUSE_DOWN);

    expect(item('a')).toHaveAttribute('data-dragging', 'true');
    expect(screen.getByRole('tree')).toHaveAttribute('data-dragging', 'true');
  });

  it('does not drag from the surface while the row own editor is open', async () => {
    seedFlat();
    render(<TodoTree getRect={getRect} />);
    await pressTitle('a');
    await userEvent.click(screen.getByRole('button', { name: 'Edit a' }));
    expect(screen.getByRole('form', { name: 'Edit a' })).toBeInTheDocument();

    fireEvent.pointerDown(titleOf('a'), MOUSE_DOWN);
    mouseMove(80);

    expect(item('a')).not.toHaveAttribute('data-dragging');
    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
    expect(item('b')).not.toHaveAttribute('data-drop');
  });

  it('balances every window listener after a surface drag', () => {
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(titleOf('a'), MOUSE_DOWN);
    mouseMove(80);
    mouseUp(80);
    fireEvent.click(titleOf('a'));

    expect(counts(add, SURFACE_LISTENERS)).toEqual({
      pointermove: 1,
      pointerup: 1,
      pointercancel: 1,
      keydown: 1,
      blur: 1,
      touchmove: 0,
      click: 1,
    });
    expect(counts(remove, SURFACE_LISTENERS)).toEqual(counts(add, SURFACE_LISTENERS));
  });

  it('clears the hold timer and every listener when it unmounts mid hold', () => {
    fakeClock();
    seedFlat();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<TodoTree getRect={getRect} />);
    fireEvent.pointerDown(titleOf('a'), TOUCH_DOWN);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    view.unmount();

    expect(counts(add, SURFACE_LISTENERS).pointermove).toBe(1);
    expect(counts(remove, SURFACE_LISTENERS)).toEqual(counts(add, SURFACE_LISTENERS));
    expect(vi.getTimerCount()).toBe(0);
  });
});
