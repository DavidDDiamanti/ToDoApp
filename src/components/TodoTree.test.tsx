import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('shows the due date in a locale-formatted form, not the raw ISO string', () => {
    seed(mk('a', null, { title: 'Alpha', due_date: '2026-01-05' }));
    render(<TodoTree />);
    const time = screen.getByRole('treeitem', { name: /alpha/i }).querySelector('time');
    expect(time).toHaveAttribute('dateTime', '2026-01-05');
    expect(time?.textContent).not.toBe('');
    expect(time?.textContent).not.toBe('2026-01-05');
  });

  it('shows date and time together', () => {
    seed(mk('a', null, { title: 'Alpha', due_date: '2026-01-05', due_time: '15:37' }));
    render(<TodoTree />);
    const time = screen.getByRole('treeitem', { name: /alpha/i }).querySelector('time');
    expect(time).toHaveAttribute('dateTime', '2026-01-05T15:37');
    expect(time?.textContent).toMatch(/15:37|3:37/);
  });

  describe('time-based overdue', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('flags an item whose time has passed today', () => {
      vi.useFakeTimers({ now: new Date(2026, 8, 10, 12, 0) });
      seed(
        mk('past', null, { title: 'Past', due_date: '2026-09-10', due_time: '11:00' }),
        mk('future', null, { title: 'Future', due_date: '2026-09-10', due_time: '13:00' }),
      );
      render(<TodoTree />);
      expect(screen.getByRole('treeitem', { name: /past/i })).toHaveAttribute('data-overdue', 'true');
      expect(screen.getByRole('treeitem', { name: /future/i })).not.toHaveAttribute('data-overdue');
    });

    it('flags an item once the clock passes its due minute, with no interaction', () => {
      vi.useFakeTimers({ now: new Date(2026, 8, 10, 12, 0) });
      seed(mk('soon', null, { title: 'Soon', due_date: '2026-09-10', due_time: '12:01' }));
      render(<TodoTree />);
      expect(screen.getByRole('treeitem', { name: /soon/i })).not.toHaveAttribute('data-overdue');
      act(() => {
        vi.advanceTimersByTime(2 * 60_000);
      });
      expect(screen.getByRole('treeitem', { name: /soon/i })).toHaveAttribute('data-overdue', 'true');
    });
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

  it('marks the item while its details are shown so narrow screens can reveal the actions', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    const item = screen.getByRole('treeitem', { name: 'Alpha' });
    expect(item).not.toHaveAttribute('data-details');
    await userEvent.click(screen.getByRole('button', { name: /show details for alpha/i }));
    expect(item).toHaveAttribute('data-details', 'true');
    expect(item).not.toHaveAttribute('aria-selected');
  });
});
