import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TodoTree } from './TodoTree';
import { moveTargets } from './MoveMenu';
import { buildChildrenMap } from '../domain/tree';
import { useTodoStore } from '../store/todoStore';
import { byId, mk } from '../test/fixtures';

function seed(...todos: ReturnType<typeof mk>[]) {
  const s = useTodoStore.getState();
  s.reset();
  for (const t of todos) s.upsertTodo(t, false);
}

beforeEach(() => {
  useTodoStore.getState().reset();
});

describe('deleting', () => {
  it('deletes a leaf immediately without a dialog', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useTodoStore.getState().todos.a.deleted_at).not.toBeNull();
  });

  it('asks what to do with children and can delete them too', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    const dialog = screen.getByRole('dialog', { name: /delete alpha/i });
    expect(dialog).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete children too' }));
    expect(useTodoStore.getState().todos.b.deleted_at).not.toBeNull();
  });

  it('can keep the children and move them up', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep children, move them up' }));
    expect(useTodoStore.getState().todos.b.deleted_at).toBeNull();
    expect(useTodoStore.getState().todos.b.parent_id).toBeNull();
    expect(useTodoStore.getState().todos.a.deleted_at).not.toBeNull();
  });

  it('cancel leaves everything untouched', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useTodoStore.getState().todos.a.deleted_at).toBeNull();
  });
});

describe('moveTargets', () => {
  it('lists every live item except the item and its descendants, with depth', () => {
    const all = byId(mk('a', null, { title: 'A' }), mk('b', 'a', { title: 'B' }), mk('c', 'b', { title: 'C' }), mk('x', null, { title: 'X' }), mk('y', 'x', { title: 'Y' }));
    const targets = moveTargets(all, buildChildrenMap(Object.values(all)), 'b');
    expect(targets).toEqual([
      { id: 'a', label: 'A', depth: 0 },
      { id: 'x', label: 'X', depth: 0 },
      { id: 'y', label: 'Y', depth: 1 },
    ]);
  });
});

describe('moving from the tree', () => {
  it('moves an item under the chosen parent', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('x', null, { title: 'Xray' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Alpha' }));
    await userEvent.selectOptions(screen.getByLabelText('Move Alpha to'), 'x');
    expect(useTodoStore.getState().todos.a.parent_id).toBe('x');
  });

  it('offers "Top level" for nested items', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Beta' }));
    await userEvent.selectOptions(screen.getByLabelText('Move Beta to'), 'Top level');
    expect(useTodoStore.getState().todos.b.parent_id).toBeNull();
  });
});

describe('move menu selection', () => {
  it('starts on a disabled placeholder so choosing Top level fires a change', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Beta' }));
    const select = screen.getByLabelText('Move Beta to') as HTMLSelectElement;
    expect(select.value).toBe('?');
    const placeholder = screen.getByRole('option', { name: 'Choose where to move it' }) as HTMLOptionElement;
    expect(placeholder.disabled).toBe(true);
    expect((screen.getByRole('option', { name: 'Top level' }) as HTMLOptionElement).selected).toBe(false);
  });

  it('Escape closes the move menu without moving', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Beta' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('Move Beta to')).toBeNull();
    expect(useTodoStore.getState().todos.b.parent_id).toBe('a');
  });
});

describe('delete dialog keyboard', () => {
  it('Escape cancels the dialog', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useTodoStore.getState().todos.a.deleted_at).toBeNull();
  });

  it('Tab cycles focus inside the dialog', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    const first = screen.getByRole('button', { name: 'Delete children too' });
    const last = screen.getByRole('button', { name: 'Cancel' });
    expect(first).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
  });
});
