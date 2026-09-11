import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Toolbar } from './Toolbar';
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

describe('editor flow', () => {
  it('opening Edit twice closes it', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.queryByRole('form', { name: 'Edit Alpha' })).toBeNull();
  });

  it('opening Add under twice closes it', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    expect(screen.queryByRole('form', { name: 'New item under Alpha' })).toBeNull();
  });

  it('opening Edit while New item is open closes New item and opens Edit', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<><Toolbar /><TodoTree /></>);
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(screen.getByRole('form', { name: 'New item' })).toBeInTheDocument();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New item' })).toBeNull();
  });

  it('Edit Alpha then Add under Alpha swaps the open editor', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Edit Alpha' })).toBeNull();
  });

  it('collapsing the parent of an item with an open editor clears openEditor', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Beta' }));
    expect(screen.getByRole('form', { name: 'Edit Beta' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Alpha' }));
    expect(useUiStore.getState().openEditor).toBeNull();
  });
});

describe('discard prompt across editors', () => {
  it('displacing a dirty editor asks first and Discard opens the requested one', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New item under Alpha' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Edit Alpha' })).toBeNull();
    expect(useUiStore.getState().editorDirty).toBe(false);
  });

  it('Keep editing leaves the first editor open with its draft', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Alpha!');
    expect(screen.queryByRole('form', { name: 'New item' })).toBeNull();
    expect(useUiStore.getState().editorDirty).toBe(true);
  });

  it('the toggle on a dirty editor asks and Discard closes without opening anything', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('form', { name: 'Edit Alpha' })).toBeNull();
    expect(useUiStore.getState().openEditor).toBeNull();
  });
});

describe('pressing outside the editor', () => {
  it('pointerdown outside a clean editor closes it', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('checkbox', { name: 'Mark Beta complete' }));

    expect(screen.queryByRole('form', { name: 'Edit Alpha' })).toBeNull();
    expect(useUiStore.getState().openEditor).toBeNull();
  });

  it('outside a dirty editor asks and the following click on the backdrop does not dismiss', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    fireEvent.pointerDown(screen.getByRole('checkbox', { name: 'Mark Beta complete' }));

    const dialog = screen.getByRole('dialog', { name: 'Discard changes?' });
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    const backdrop = dialog.parentElement as HTMLElement;
    fireEvent.click(backdrop);

    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(useUiStore.getState().editorDirty).toBe(true);
  });

  it('pointerdown inside the form does nothing', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    fireEvent.pointerDown(screen.getByLabelText('Title'));

    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).toBeNull();
    expect(useUiStore.getState().editorDirty).toBe(true);
  });

  it('pointerdown on the editor own toggle does nothing', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Edit Alpha' }));

    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).toBeNull();
    expect(useUiStore.getState().pendingClose).toBeNull();
  });

  it('pointerdown inside an open dialog does nothing', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    render(<><Toolbar /><TodoTree /></>);
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Keep editing' }));

    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(useUiStore.getState().pendingClose).not.toBeNull();
  });
});
