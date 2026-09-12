import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodoTree } from './TodoTree';
import { useTodoStore } from '../store/todoStore';
import { useUiStore } from '../store/uiStore';
import { useDragStore } from '../dnd/dragStore';
import { mk } from '../test/fixtures';
import { pressTitle } from '../test/press';

/** The body wrapper of an item: the hover surface, and everything but the item's children. */
function bodyOf(title: string): HTMLElement {
  const body = screen.getByRole('treeitem', { name: title }).querySelector('[data-item-body]');
  if (!(body instanceof HTMLElement)) throw new Error(`no body for ${title}`);
  return body;
}

function seed(...todos: ReturnType<typeof mk>[]) {
  const s = useTodoStore.getState();
  s.reset();
  for (const t of todos) s.upsertTodo(t, false);
}

beforeEach(() => {
  useTodoStore.getState().reset();
  useUiStore.getState().reset();
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

  it('pressing a title reveals its actions and sets data-active', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    const item = screen.getByRole('treeitem', { name: 'Alpha' });
    expect(item).not.toHaveAttribute('data-active');
    expect(screen.queryByRole('button', { name: 'Edit Alpha' })).toBeNull();
    await pressTitle('Alpha');
    expect(item).toHaveAttribute('data-active', 'true');
    expect(item).not.toHaveAttribute('aria-selected');
    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeInTheDocument();
  });

  it('only one item shows actions at a time', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }));
    render(<TodoTree />);
    await pressTitle('Alpha');
    // A click leaves the simulated pointer over Alpha; a real one leaves on the way to Beta.
    fireEvent.pointerLeave(bodyOf('Alpha'));
    await pressTitle('Beta');
    expect(screen.getByRole('button', { name: 'Edit Beta' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Alpha' })).toBeNull();
    expect(screen.getByRole('button', { name: /details for alpha/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('pressing the active title again hides details but keeps the actions', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    await pressTitle('Alpha');
    await pressTitle('Alpha');
    expect(screen.getByRole('button', { name: /show details for alpha/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeInTheDocument();
  });

  it('collapsing the parent of the active item clears activeItemId', async () => {
    seed(mk('shop', null, { title: 'Shopping' }), mk('shoes', 'shop', { title: 'Shoe store' }));
    render(<TodoTree />);
    await pressTitle('Shoe store');
    expect(useUiStore.getState().activeItemId).toBe('shoes');
    await userEvent.click(screen.getByRole('button', { name: /collapse shopping/i }));
    expect(useUiStore.getState().activeItemId).toBeNull();
  });

  it('a parent row orders handle, checkbox, title, then the chevron', () => {
    seed(mk('shop', null, { title: 'Shopping' }), mk('shoes', 'shop', { title: 'Shoe store' }));
    render(<TodoTree />);
    const item = screen.getByRole('treeitem', { name: /shopping/i });
    const row = item.querySelector('[data-todo-id]') as HTMLElement;
    expect(row.children).toHaveLength(4);
    expect(row.children[0]).toHaveAttribute('aria-label', 'Move Shopping');
    expect(row.children[1]).toHaveAttribute('type', 'checkbox');
    expect(row.children[2]).toHaveAttribute('aria-label', 'Show details for Shopping');
    expect(row.children[3].tagName).toBe('BUTTON');
    expect(row.children[3]).toHaveAttribute('aria-label', 'Collapse Shopping');
  });

  it('a leaf row has nothing after the title', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    const item = screen.getByRole('treeitem', { name: /alpha/i });
    const row = item.querySelector('[data-todo-id]') as HTMLElement;
    expect(row.querySelector('.spacer')).toBeNull();
    expect(row.children).toHaveLength(3);
    expect(row.children[0]).toHaveAttribute('aria-label', 'Move Alpha');
    expect(row.children[1]).toHaveAttribute('type', 'checkbox');
    expect(row.children[2]).toHaveAttribute('aria-label', 'Show details for Alpha');
  });

  it('marks the title button as a drag surface', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    expect(screen.getByRole('button', { name: /details for alpha/i })).toHaveAttribute('data-drag-surface');
  });
});

describe('depth shading and the body wrapper', () => {
  it('sets --depth from nesting', () => {
    seed(mk('shop', null, { title: 'Shopping' }), mk('shoes', 'shop', { title: 'Shoe store' }));
    render(<TodoTree />);
    expect(screen.getByRole('treeitem', { name: /shopping/i }).style.getPropertyValue('--depth')).toBe('0');
    expect(screen.getByRole('treeitem', { name: /shoe store/i }).style.getPropertyValue('--depth')).toBe('1');
  });

  it('the body wraps the row and details but not the children', async () => {
    seed(mk('shop', null, { title: 'Shopping' }), mk('shoes', 'shop', { title: 'Shoe store' }));
    render(<TodoTree />);
    await pressTitle('Shopping');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Shopping' }));

    const item = screen.getByRole('treeitem', { name: /shopping/i });
    expect(Array.from(item.children).map((c) => c.className)).toEqual(['body', 'children']);

    const body = item.children[0];
    expect(body.querySelector('[data-todo-id]')).toHaveAttribute('data-todo-id', 'shop');
    expect(body.querySelector('[data-editor-root]')).not.toBeNull();
    expect(body.querySelector('.details')).not.toBeNull();
    expect(body.querySelector('[role="group"]')).toBeNull();
    expect(item.children[1]).toHaveAttribute('role', 'group');
  });
});

describe('hover', () => {
  afterEach(() => {
    useDragStore.getState().end();
  });

  it('reveals the actions on a mouse hover without selecting the item', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    expect(screen.queryByRole('button', { name: 'Edit Alpha' })).toBeNull();

    fireEvent.pointerEnter(bodyOf('Alpha'), { pointerType: 'mouse' });

    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add item under Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Alpha' })).toBeInTheDocument();
    expect(useUiStore.getState().activeItemId).toBeNull();
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).toHaveAttribute('data-hovered', 'true');
  });

  it('hides the actions again when the pointer leaves', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    fireEvent.pointerEnter(bodyOf('Alpha'), { pointerType: 'mouse' });
    fireEvent.pointerLeave(bodyOf('Alpha'));

    expect(screen.queryByRole('button', { name: 'Edit Alpha' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add item under Alpha' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Alpha' })).toBeNull();
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).not.toHaveAttribute('data-hovered');
  });

  it('ignores a touch pointer, which has no hover', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    fireEvent.pointerEnter(bodyOf('Alpha'), { pointerType: 'touch' });

    expect(screen.queryByRole('button', { name: 'Edit Alpha' })).toBeNull();
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).not.toHaveAttribute('data-hovered');
  });

  it('does not flash the actions on rows a drag crosses', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    act(() => useDragStore.getState().start('other'));

    fireEvent.pointerEnter(bodyOf('Alpha'), { pointerType: 'mouse' });

    expect(screen.queryByRole('button', { name: 'Edit Alpha' })).toBeNull();
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).not.toHaveAttribute('data-hovered');
  });

  it('reveals only the hovered child, not its parent', () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<TodoTree />);
    fireEvent.pointerEnter(bodyOf('Beta'), { pointerType: 'mouse' });

    expect(screen.getByRole('button', { name: 'Edit Beta' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Alpha' })).toBeNull();
    expect(screen.getByRole('treeitem', { name: 'Beta' })).toHaveAttribute('data-hovered', 'true');
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).not.toHaveAttribute('data-hovered');
  });

  it('hides the actions of the dragged row for the length of its own drag', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    fireEvent.pointerEnter(bodyOf('Alpha'), { pointerType: 'mouse' });
    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeInTheDocument();

    act(() => { useDragStore.getState().start('a'); });
    expect(screen.queryByRole('button', { name: 'Edit Alpha' })).toBeNull();
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).not.toHaveAttribute('data-hovered');

    // The pointer never left the row, so the drop reveals the buttons again.
    act(() => { useDragStore.getState().end(); });
    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeInTheDocument();
  });

  it('keeps the hover on the dragged row when its own drop moves it', () => {
    const alpha = mk('a', null, { title: 'Alpha' });
    seed(alpha, mk('b', null, { title: 'Beta' }));
    render(<TodoTree />);
    fireEvent.pointerEnter(bodyOf('Alpha'), { pointerType: 'mouse' });
    act(() => { useDragStore.getState().start('a'); });

    // A drop commits the move and ends the drag in one handler, so React batches both.
    act(() => {
      useTodoStore.getState().upsertTodo({ ...alpha, sort_order: alpha.sort_order + 10 }, false);
      useDragStore.getState().end();
    });

    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeInTheDocument();
  });

  it('forgets the hover when the item moves without a pointer event', () => {
    const alpha = mk('a', null, { title: 'Alpha' });
    seed(alpha, mk('b', null, { title: 'Beta' }));
    render(<TodoTree />);
    fireEvent.pointerEnter(bodyOf('Alpha'), { pointerType: 'mouse' });
    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeInTheDocument();

    // A keyboard move or a drop lands the row somewhere else; no pointerleave fires for that.
    // Braces matter: the persisted store returns a thenable from set, and act() would go async on it.
    act(() => {
      useTodoStore.getState().upsertTodo({ ...alpha, sort_order: alpha.sort_order + 10 }, false);
    });

    expect(screen.queryByRole('button', { name: 'Edit Alpha' })).toBeNull();
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).not.toHaveAttribute('data-hovered');
  });

  it('keeps the actions on a selected item after the pointer leaves', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<TodoTree />);
    await pressTitle('Alpha');
    fireEvent.pointerLeave(bodyOf('Alpha'));

    expect(useUiStore.getState().activeItemId).toBe('a');
    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeInTheDocument();
  });
});
