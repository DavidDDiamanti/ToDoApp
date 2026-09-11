import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TodoTree } from './TodoTree';
import { useTodoStore } from '../store/todoStore';
import { mk } from '../test/fixtures';

function seed(...todos: ReturnType<typeof mk>[]) {
  const s = useTodoStore.getState();
  s.reset();
  for (const t of todos) s.upsertTodo(t, false);
}

beforeEach(() => {
  useTodoStore.getState().reset();
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
    expect(screen.getByRole('status').textContent).toBe('Cannot move a up');
    expect(useTodoStore.getState().todos).toEqual(before);
  });

  it('announces success with destination and position', async () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    render(<TodoTree />);
    screen.getByRole('button', { name: 'Move b' }).focus();
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(screen.getByRole('status').textContent).toBe('Moved b under a, position 1 of 1');
  });

  it('ignores arrow keys pressed without Alt', async () => {
    seed(mk('a', null, { sort_order: 0 }), mk('b', null, { sort_order: 1 }));
    render(<TodoTree />);
    const before = useTodoStore.getState().todos;
    screen.getByRole('button', { name: 'Move a' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(useTodoStore.getState().todos).toEqual(before);
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
