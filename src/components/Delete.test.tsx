import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TodoTree } from './TodoTree';
import { useTodoStore } from '../store/todoStore';
import { useUiStore } from '../store/uiStore';
import { mk } from '../test/fixtures';
import { pressTitle } from '../test/press';

function seed(...todos: ReturnType<typeof mk>[]) {
  const s = useTodoStore.getState();
  s.reset();
  for (const t of todos) s.upsertTodo(t, false);
}

beforeEach(() => {
  useTodoStore.getState().reset();
  useUiStore.getState().reset();
});

describe('deleting', () => {
  it('asks before deleting a leaf', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    const dialog = screen.getByRole('dialog', { name: /delete 'alpha'\?/i });
    expect(dialog).toBeInTheDocument();
    expect(useTodoStore.getState().todos.a.deleted_at).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(useTodoStore.getState().todos.a.deleted_at).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancelling a leaf delete keeps it', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useTodoStore.getState().todos.a.deleted_at).toBeNull();
  });

  it('asks what to do with children and can delete them too', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    const dialog = screen.getByRole('dialog', { name: /delete 'alpha'\?/i });
    expect(dialog).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete children too' }));
    expect(useTodoStore.getState().todos.b.deleted_at).not.toBeNull();
  });

  it('can keep the children and move them up', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep children, move them up' }));
    expect(useTodoStore.getState().todos.b.deleted_at).toBeNull();
    expect(useTodoStore.getState().todos.b.parent_id).toBeNull();
    expect(useTodoStore.getState().todos.a.deleted_at).not.toBeNull();
  });

  it('cancel leaves everything untouched', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useTodoStore.getState().todos.a.deleted_at).toBeNull();
  });

  it('no move menu', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    expect(screen.queryByLabelText(/Move .* to$/)).toBeNull();
  });
});

describe('delete dialog keyboard', () => {
  it('Escape cancels the dialog', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useTodoStore.getState().todos.a.deleted_at).toBeNull();
  });

  it('Tab cycles focus inside the dialog', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    await pressTitle('Alpha');
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
