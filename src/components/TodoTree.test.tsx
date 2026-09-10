import { render, screen, within } from '@testing-library/react';
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

describe('TodoTree', () => {
  it('shows an empty state when there are no items', () => {
    render(<TodoTree />);
    expect(screen.getByText(/nothing to do yet/i)).toBeInTheDocument();
  });

  it('renders nested items under their parent', () => {
    seed(mk('shop', null, { title: 'Shopping' }), mk('shoes', 'shop', { title: 'Shoe store' }));
    render(<TodoTree />);
    const parent = screen.getByRole('treeitem', { name: /shopping/i });
    expect(within(parent).getByRole('treeitem', { name: /shoe store/i })).toBeInTheDocument();
  });

  it('collapses and expands children with the chevron', async () => {
    seed(mk('shop', null, { title: 'Shopping' }), mk('shoes', 'shop', { title: 'Shoe store' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: /collapse shopping/i }));
    expect(screen.queryByText('Shoe store')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /expand shopping/i }));
    expect(screen.getByText('Shoe store')).toBeInTheDocument();
  });

  it('ticking a parent completes its children through the store', async () => {
    seed(mk('shop', null, { title: 'Shopping' }), mk('shoes', 'shop', { title: 'Shoe store' }));
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('checkbox', { name: /mark shopping complete/i }));
    expect(useTodoStore.getState().todos.shoes.completed).toBe(true);
    expect(screen.getByRole('checkbox', { name: /mark shoe store incomplete/i })).toBeChecked();
  });

  it('flags overdue items and not completed ones', () => {
    seed(mk('late', null, { title: 'Late', due_date: '2000-01-01' }), mk('done', null, { title: 'Done', due_date: '2000-01-01', completed: true }));
    render(<TodoTree />);
    expect(screen.getByRole('treeitem', { name: /late/i })).toHaveAttribute('data-overdue', 'true');
    expect(screen.getByRole('treeitem', { name: /done/i })).not.toHaveAttribute('data-overdue');
  });

  it('hides completed subtrees when hideCompleted is on', () => {
    seed(mk('a', null, { title: 'Alpha', completed: true }), mk('b', 'a', { title: 'Beta', completed: true }), mk('c', null, { title: 'Gamma' }));
    useTodoStore.getState().setHideCompleted(true);
    render(<TodoTree />);
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.queryByText('Beta')).toBeNull();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('shows the description when an item is expanded', async () => {
    seed(mk('a', null, { title: 'Alpha', description: 'Bring the list' }));
    render(<TodoTree />);
    expect(screen.queryByText('Bring the list')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /show details for alpha/i }));
    expect(screen.getByText('Bring the list')).toBeInTheDocument();
  });
});
