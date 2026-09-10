import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodoEditor } from './TodoEditor';
import { TodoTree } from './TodoTree';
import { useTodoStore } from '../store/todoStore';
import { mk } from '../test/fixtures';

const initial = { title: 'Milk', description: '', due_date: null, color: 'slate' as const };

beforeEach(() => {
  useTodoStore.getState().reset();
});

describe('TodoEditor', () => {
  it('saves on Enter in the title field with trimmed values', async () => {
    const onSave = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} onCancel={() => {}} />);
    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, '  Oat milk {Enter}');
    expect(onSave).toHaveBeenCalledWith({ title: 'Oat milk', description: '', due_date: null, color: 'slate' });
  });

  it('refuses an empty title and shows an error', async () => {
    const onSave = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} onCancel={() => {}} />);
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });

  it('moves focus to the title field when submit fails validation', async () => {
    const onSave = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} onCancel={() => {}} />);
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByLabelText('Title')).toHaveFocus();
  });

  it('cancels on Escape', async () => {
    const onCancel = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={() => {}} onCancel={onCancel} />);
    await userEvent.type(screen.getByLabelText('Title'), '{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('changes colour and date and description', async () => {
    const onSave = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    await userEvent.type(screen.getByLabelText('Description'), 'Two litres');
    const date = screen.getByLabelText('Due date');
    await userEvent.type(date, '2026-12-24');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Milk', description: 'Two litres', due_date: '2026-12-24', color: 'teal' });
  });
});

describe('editing from the tree', () => {
  it('edit button opens the editor and saving patches the store', async () => {
    useTodoStore.getState().upsertTodo(mk('a', null, { title: 'Alpha' }), false);
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Alpha 2{Enter}');
    expect(useTodoStore.getState().todos.a.title).toBe('Alpha 2');
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('add-under button creates a child of that item', async () => {
    useTodoStore.getState().upsertTodo(mk('a', null, { title: 'Alpha' }), false);
    render(<TodoTree />);
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Child{Enter}');
    const child = Object.values(useTodoStore.getState().todos).find((t) => t.title === 'Child');
    expect(child?.parent_id).toBe('a');
  });
});
