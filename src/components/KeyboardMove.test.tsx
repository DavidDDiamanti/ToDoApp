import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TodoTree } from './TodoTree';
import { useDragStore } from '../dnd/dragStore';
import { useTodoStore } from '../store/todoStore';
import { mk } from '../test/fixtures';

function seed(...todos: ReturnType<typeof mk>[]) {
  const s = useTodoStore.getState();
  s.reset();
  for (const t of todos) s.upsertTodo(t, false);
}

beforeEach(() => {
  useTodoStore.getState().reset();
  useDragStore.setState({ draggingId: null, indicator: null, announcement: { text: '', seq: 0 }, focusId: null });
});

function rootOrder() {
  return Object.values(useTodoStore.getState().todos)
    .filter((t) => t.parent_id === null)
    .sort((x, y) => x.sort_order - y.sort_order)
    .map((t) => t.id);
}

describe('keyboard moves', () => {
  it('Alt+ArrowDown moves an item down among its siblings', async () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    render(<TodoTree />);
    screen.getByRole('button', { name: 'Move a' }).focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(rootOrder()).toEqual(['b', 'a']);
  });

  it('Alt+ArrowRight nests under the previous sibling and restores focus to the moved handle', async () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    render(<TodoTree />);
    screen.getByRole('button', { name: 'Move b' }).focus();
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(useTodoStore.getState().todos.b.parent_id).toBe('a');
    expect(screen.getByRole('button', { name: 'Move b' })).toHaveFocus();
  });

  it('Alt+ArrowLeft moves a nested item out to sit right after its parent', async () => {
    seed(
      mk('a', null, { sort_order: 0 }),
      mk('b', null, { sort_order: 1 }),
      mk('c', 'a', { sort_order: 0 }),
    );
    render(<TodoTree />);
    screen.getByRole('button', { name: 'Move c' }).focus();
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(useTodoStore.getState().todos.c.parent_id).toBeNull();
    expect(rootOrder()).toEqual(['a', 'c', 'b']);
  });

  it('announces failure and leaves the store unchanged at the top of the list', async () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    render(<TodoTree />);
    const before = useTodoStore.getState().todos;
    screen.getByRole('button', { name: 'Move a' }).focus();
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(screen.getByRole('status').textContent?.trim()).toBe('Cannot move a up');
    expect(useTodoStore.getState().todos).toEqual(before);
  });

  it('announces success with destination and position', async () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    render(<TodoTree />);
    screen.getByRole('button', { name: 'Move b' }).focus();
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(screen.getByRole('status').textContent?.trim()).toBe('Moved b under a, position 1 of 1');
  });

  it('ignores arrow keys pressed without Alt', async () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    render(<TodoTree />);
    const before = useTodoStore.getState().todos;
    screen.getByRole('button', { name: 'Move a' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(useTodoStore.getState().todos).toEqual(before);
  });

  it('Alt+ArrowRight into a collapsed sibling expands it and keeps focus', async () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    act(() => {
      useTodoStore.getState().toggleCollapsed('a');
    });
    render(<TodoTree />);
    screen.getByRole('button', { name: 'Move b' }).focus();
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(useTodoStore.getState().todos.b.parent_id).toBe('a');
    expect(useTodoStore.getState().collapsed.a).toBeFalsy();
    expect(screen.getByRole('button', { name: 'Move b' })).toHaveFocus();
  });

  it('focusId is cleared when the focused row unmounts', () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', 'a', { sort_order: 0 }));
    render(<TodoTree />);
    act(() => {
      useDragStore.getState().requestFocus('b');
      useTodoStore.getState().toggleCollapsed('a');
    });
    expect(screen.queryByRole('button', { name: 'Move b' })).toBeNull();
    expect(useDragStore.getState().focusId).toBeNull();
  });

  it('keeps one live region node and changes its text for repeated announcements', async () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    render(<TodoTree />);
    const status = screen.getByRole('status');
    screen.getByRole('button', { name: 'Move a' }).focus();
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(status.textContent?.trim()).toBe('Cannot move a up');
    const firstText = status.textContent;
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(screen.getByRole('status')).toBe(status);
    expect(status.textContent?.trim()).toBe('Cannot move a up');
    expect(status.textContent).not.toBe(firstText);
  });

  describe('with completed rows hidden', () => {
    it('refuses Alt+ArrowRight onto a hidden completed sibling above', async () => {
      seed(mk('a', null, { sort_order: 0, completed: true }), mk('b', null, { sort_order: 1 }));
      act(() => {
        useTodoStore.getState().setHideCompleted(true);
      });
      render(<TodoTree />);
      screen.getByRole('button', { name: 'Move b' }).focus();
      await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
      expect(screen.getByRole('status').textContent?.trim()).toBe('Cannot move b right');
      expect(useTodoStore.getState().todos.b.parent_id).toBeNull();
    });

    it('refuses Alt+ArrowUp over a hidden completed sibling above', async () => {
      seed(mk('a', null, { sort_order: 0, completed: true }), mk('b', null, { sort_order: 1 }));
      act(() => {
        useTodoStore.getState().setHideCompleted(true);
      });
      render(<TodoTree />);
      const before = useTodoStore.getState().todos;
      screen.getByRole('button', { name: 'Move b' }).focus();
      await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
      expect(screen.getByRole('status').textContent?.trim()).toBe('Cannot move b up');
      expect(useTodoStore.getState().todos).toEqual(before);
    });
  });

  it('gives every handle an accessible name and a description pointing at the hint', () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    render(<TodoTree />);
    for (const id of ['a', 'b']) {
      const handle = screen.getByRole('button', { name: `Move ${id}` });
      expect(handle).toHaveAccessibleDescription(/alt with an arrow key/i);
    }
  });
});
