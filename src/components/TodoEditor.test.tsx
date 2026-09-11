import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isDirty, TodoEditor } from './TodoEditor';
import { TodoTree } from './TodoTree';
import { useTodoStore } from '../store/todoStore';
import { useUiStore } from '../store/uiStore';
import { mk } from '../test/fixtures';
import { pressTitle } from '../test/press';

const initial = { title: 'Milk', description: '', due_date: null, due_time: null, color: 'slate' as const };

beforeEach(() => {
  useTodoStore.getState().reset();
  useUiStore.getState().reset();
  useUiStore.getState().requestOpen({ kind: 'root' });
});

describe('TodoEditor', () => {
  it('saves on Enter in the title field with trimmed values', async () => {
    const onSave = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} />);
    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, '  Oat milk {Enter}');
    expect(onSave).toHaveBeenCalledWith({ title: 'Oat milk', description: '', due_date: null, due_time: null, color: 'slate' });
  });

  it('refuses an empty title and shows an error', async () => {
    const onSave = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });

  it('moves focus to the title field when submit fails validation', async () => {
    const onSave = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByLabelText('Title')).toHaveFocus();
  });

  it('changes colour and date and description', async () => {
    const onSave = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    await userEvent.type(screen.getByLabelText('Description'), 'Two litres');
    const date = screen.getByLabelText('Due date');
    await userEvent.type(date, '2026-12-24');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Milk', description: 'Two litres', due_date: '2026-12-24', due_time: null, color: 'teal' });
  });

  it('saves a due time with its date', async () => {
    const onSave = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} />);
    await userEvent.type(screen.getByLabelText('Due date'), '2026-12-24');
    await userEvent.type(screen.getByLabelText('Due time'), '15:37');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Milk', description: '', due_date: '2026-12-24', due_time: '15:37', color: 'slate' });
  });

  it('a time without a date resolves to its next occurrence', async () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} now={() => new Date(2026, 8, 10, 16, 0)} />,
    );
    await userEvent.type(screen.getByLabelText('Due time'), '15:37');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Milk', description: '', due_date: '2026-09-11', due_time: '15:37', color: 'slate' });

    onSave.mockClear();
    rerender(
      <TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} now={() => new Date(2026, 8, 10, 15, 0)} />,
    );
    await userEvent.clear(screen.getByLabelText('Due time'));
    await userEvent.type(screen.getByLabelText('Due time'), '15:37');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Milk', description: '', due_date: '2026-09-10', due_time: '15:37', color: 'slate' });
  });

  it('pre-fills the time from initial', () => {
    render(
      <TodoEditor
        initial={{ title: 'Milk', description: '', due_date: '2026-09-10', due_time: '08:00', color: 'slate' }}
        heading="Edit item"
        submitLabel="Save changes"
        onSave={() => {}}
      />,
    );
    expect(screen.getByLabelText('Due time')).toHaveValue('08:00');
  });

  it('saves a seconds-bearing initial time back as HH:MM', async () => {
    const onSave = vi.fn();
    render(
      <TodoEditor
        initial={{ title: 'Milk', description: '', due_date: '2026-09-10', due_time: '09:30:00', color: 'slate' }}
        heading="Edit item"
        submitLabel="Save changes"
        onSave={onSave}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Milk', description: '', due_date: '2026-09-10', due_time: '09:30', color: 'slate' });
  });
});

describe('editing from the tree', () => {
  it('edit button opens the editor and saving patches the store', async () => {
    useTodoStore.getState().upsertTodo(mk('a', null, { title: 'Alpha' }), false);
    render(<TodoTree />);
    await pressTitle('Alpha');
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
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Child{Enter}');
    const child = Object.values(useTodoStore.getState().todos).find((t) => t.title === 'Child');
    expect(child?.parent_id).toBe('a');
  });
});

describe('isDirty', () => {
  it('treats an untouched draft as clean', () => {
    expect(isDirty(initial, { title: 'Milk', description: '', dueDate: '', dueTime: '', color: 'slate' })).toBe(false);
  });

  it('ignores surrounding whitespace in the title and description', () => {
    expect(isDirty(initial, { title: '  Milk  ', description: '  ', dueDate: '', dueTime: '', color: 'slate' })).toBe(false);
  });

  it('sees a changed date, time or colour', () => {
    const draft = { title: 'Milk', description: '', dueDate: '', dueTime: '', color: 'slate' as const };
    expect(isDirty(initial, { ...draft, dueDate: '2026-12-24' })).toBe(true);
    expect(isDirty(initial, { ...draft, dueTime: '09:00' })).toBe(true);
    expect(isDirty(initial, { ...draft, color: 'teal' })).toBe(true);
  });

  it('compares a cleared date against an initial date', () => {
    const withDate = { ...initial, due_date: '2026-12-24', due_time: '09:00' };
    expect(isDirty(withDate, { title: 'Milk', description: '', dueDate: '2026-12-24', dueTime: '09:00', color: 'slate' })).toBe(false);
    expect(isDirty(withDate, { title: 'Milk', description: '', dueDate: '', dueTime: '09:00', color: 'slate' })).toBe(true);
  });
});

describe('discarding editor changes', () => {
  function renderEditor() {
    const onSave = vi.fn();
    render(<TodoEditor initial={initial} heading="Edit item" submitLabel="Save changes" onSave={onSave} />);
    return onSave;
  }

  it('publishes dirtiness to the store', async () => {
    renderEditor();
    expect(useUiStore.getState().editorDirty).toBe(false);
    await userEvent.type(screen.getByLabelText('Title'), '!');
    expect(useUiStore.getState().editorDirty).toBe(true);
  });

  it('retyping the original value counts as clean', async () => {
    renderEditor();
    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    expect(useUiStore.getState().editorDirty).toBe(true);
    await userEvent.type(title, 'Milk');
    expect(useUiStore.getState().editorDirty).toBe(false);
  });

  it('trailing whitespace in the title is not a change', async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText('Title'), '   ');
    expect(useUiStore.getState().editorDirty).toBe(false);
  });

  it('Escape with untouched fields closes the editor', async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText('Title'), '{Escape}');
    expect(useUiStore.getState().openEditor).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape after typing asks before discarding', async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText('Title'), ' shake{Escape}');
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(useUiStore.getState().openEditor).toEqual({ kind: 'root' });
  });

  it('Keep editing keeps the draft and returns focus to the title', async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText('Title'), ' shake{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Title')).toHaveValue('Milk shake');
    expect(screen.getByLabelText('Title')).toHaveFocus();
    expect(useUiStore.getState().openEditor).toEqual({ kind: 'root' });
  });

  it('a second Escape in the prompt keeps editing without asking again', async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText('Title'), ' shake{Escape}');
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useUiStore.getState().pendingClose).toBeNull();
    expect(useUiStore.getState().openEditor).toEqual({ kind: 'root' });
    expect(screen.getByLabelText('Title')).toHaveValue('Milk shake');
  });

  it('Discard closes the editor', async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText('Title'), ' shake{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(useUiStore.getState().openEditor).toBeNull();
    expect(useUiStore.getState().editorDirty).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Cancel routes the same way as Escape', async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText('Title'), ' shake');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(useUiStore.getState().openEditor).toEqual({ kind: 'root' });
  });

  it('Cancel with untouched fields closes the editor', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useUiStore.getState().openEditor).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saving never asks', async () => {
    const onSave = renderEditor();
    await userEvent.type(screen.getByLabelText('Title'), ' shake');
    expect(useUiStore.getState().editorDirty).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Milk shake', description: '', due_date: null, due_time: null, color: 'slate' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useUiStore.getState().openEditor).toBeNull();
  });

  it('Keep editing via the Cancel button returns focus to the title', async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText('Title'), ' shake');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Title')).toHaveFocus();
  });
});
