import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Toolbar } from './Toolbar';
import { TodoTree } from './TodoTree';
import { TIP } from './tips';
import { useTodoStore } from '../store/todoStore';
import { useUiStore } from '../store/uiStore';
import { mk } from '../test/fixtures';
import { pressTitle } from '../test/press';

function seed(...todos: ReturnType<typeof mk>[]) {
  const s = useTodoStore.getState();
  s.reset();
  for (const t of todos) s.upsertTodo(t, false);
}

function tip(name: string): string | null {
  return screen.getByRole('button', { name }).getAttribute('title');
}

beforeEach(() => {
  useTodoStore.getState().reset();
  useUiStore.getState().reset();
});

describe('hover text', () => {
  beforeEach(async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
  });

  it('gives every button, checkbox and radio a non-empty title', () => {
    const controls = [
      ...screen.getAllByRole('button'),
      ...screen.getAllByRole('checkbox'),
      ...screen.getAllByRole('radio'),
    ];
    expect(controls.length).toBeGreaterThan(0);
    const untitled = controls.filter((c) => (c.getAttribute('title') ?? '').length === 0);
    expect(untitled.map((c) => c.getAttribute('aria-label') ?? c.textContent)).toEqual([]);
  });

  it('titles the row controls', () => {
    expect(tip('Move Alpha')).toBe(TIP.move);
    expect(tip('Edit Alpha')).toBe(TIP.edit);
    expect(tip('Add item under Alpha')).toBe(TIP.add);
    expect(tip('Delete Alpha')).toBe(TIP.delete);
    expect(tip('Hide details for Alpha')).toBe(TIP.hideDetails);
    expect(tip('Show details for Beta')).toBe(TIP.showDetails);
  });

  it('flips the chevron title when the item collapses', async () => {
    expect(tip('Collapse Alpha')).toBe(TIP.collapse);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Alpha' }));
    expect(tip('Expand Alpha')).toBe(TIP.expand);
  });

  it('flips the checkbox title when the item completes', async () => {
    const box = screen.getByRole('checkbox', { name: 'Mark Alpha complete' });
    expect(box).toHaveAttribute('title', TIP.complete);
    await userEvent.click(box);
    expect(screen.getByRole('checkbox', { name: 'Mark Alpha incomplete' })).toHaveAttribute('title', TIP.incomplete);
  });

  it('titles the editor buttons and swatches', () => {
    const form = within(screen.getByRole('form', { name: 'New item' }));
    expect(form.getByRole('button', { name: 'Add item' })).toHaveAttribute('title', 'Add item');
    expect(form.getByRole('button', { name: 'Cancel' })).toHaveAttribute('title', TIP.cancel);
    expect(form.getByRole('radio', { name: 'Teal' })).toHaveAttribute('title', 'Teal');
  });

  it('titles the toolbar controls', () => {
    expect(screen.getByRole('checkbox', { name: 'Hide completed' })).toHaveAttribute('title', TIP.hideCompleted);
    expect(tip('New item')).toBe(TIP.newItem);
    expect(tip('Sign out')).toBe(TIP.signOut);
  });
});

describe('hover text in the delete dialog', () => {
  it('titles each dialog button with its own label', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));

    const buttons = within(screen.getByRole('dialog')).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(b).toHaveAttribute('title', b.textContent);
  });
});
