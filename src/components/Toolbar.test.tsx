import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Toolbar } from './Toolbar';
import { TodoTree } from './TodoTree';
import { useTodoStore } from '../store/todoStore';
import { useUiStore } from '../store/uiStore';

beforeEach(() => {
  useTodoStore.getState().reset();
  useUiStore.getState().reset();
});

describe('Toolbar', () => {
  it('adds a top-level item through the editor', async () => {
    render(<><Toolbar /><TodoTree /></>);
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Groceries{Enter}');
    expect(screen.getByRole('treeitem', { name: 'Groceries' })).toBeInTheDocument();
    expect(Object.values(useTodoStore.getState().todos)[0].parent_id).toBeNull();
  });

  it('toggles hide completed', async () => {
    render(<Toolbar />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hide completed' }));
    expect(useTodoStore.getState().hideCompleted).toBe(true);
  });

  it('pressing New item again closes the editor', async () => {
    render(<Toolbar />);
    const button = screen.getByRole('button', { name: 'New item' });
    await userEvent.click(button);
    expect(screen.getByRole('form', { name: 'New item' })).toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.queryByRole('form', { name: 'New item' })).toBeNull();
  });

  it('New item exposes aria-expanded', async () => {
    render(<Toolbar />);
    const button = screen.getByRole('button', { name: 'New item' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});
