import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { Toolbar } from './Toolbar';
import { TodoTree } from './TodoTree';
import { useDragStore } from '../dnd/dragStore';
import { useTodoStore } from '../store/todoStore';
import { useUiStore } from '../store/uiStore';
import { useEnterToCreate } from '../hooks/useEnterToCreate';
import { useOutsidePress } from '../hooks/useOutsidePress';
import { mk } from '../test/fixtures';
import { pressTitle } from '../test/press';

/** The global input hooks live in Shell, which this harness does not render; mount them explicitly instead. */
function GlobalInput() {
  useOutsidePress();
  useEnterToCreate();
  return null;
}

function renderApp() {
  return render(<><GlobalInput /><Toolbar /><TodoTree /></>);
}

function seed(...todos: ReturnType<typeof mk>[]) {
  const s = useTodoStore.getState();
  s.reset();
  for (const t of todos) s.upsertTodo(t, false);
}

const LISTENERS = ['pointermove', 'pointerup', 'pointercancel', 'keydown', 'blur'];

type ListenerSpy = MockInstance<(type: string, ...rest: never[]) => void>;

function counts(spy: ListenerSpy) {
  const out: Record<string, number> = {};
  for (const name of LISTENERS) out[name] = spy.mock.calls.filter((c) => c[0] === name).length;
  return out;
}

/** The title button, whatever state its details are in. */
function titleOf(title: string) {
  return (
    screen.queryByRole('button', { name: `Show details for ${title}` }) ??
    screen.getByRole('button', { name: `Hide details for ${title}` })
  );
}

const MOUSE_DOWN = { button: 0, pointerId: 1, clientX: 100, clientY: 10, pointerType: 'mouse' } as const;

function mouseMove(clientY: number) {
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY, pointerType: 'mouse', buttons: 1 });
}

beforeEach(() => {
  useTodoStore.getState().reset();
  useUiStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('editor flow', () => {
  it('opening Edit twice closes it', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.queryByRole('form', { name: 'Edit Alpha' })).toBeNull();
  });

  it('opening Add under twice closes it', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    expect(screen.queryByRole('form', { name: 'New item under Alpha' })).toBeNull();
  });

  it('opening Edit while New item is open closes New item and opens Edit', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(screen.getByRole('form', { name: 'New item' })).toBeInTheDocument();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New item' })).toBeNull();
  });

  it('Edit Alpha then Add under Alpha swaps the open editor', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Edit Alpha' })).toBeNull();
  });

  it('collapsing the parent of an item with an open editor clears openEditor', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    renderApp();
    await pressTitle('Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Beta' }));
    expect(screen.getByRole('form', { name: 'Edit Beta' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Alpha' }));
    expect(useUiStore.getState().openEditor).toBeNull();
  });
});

describe('unsaved-changes prompt across editors', () => {
  it('displacing a dirty editor asks first and Discard opens the requested one', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New item under Alpha' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Edit Alpha' })).toBeNull();
    expect(useUiStore.getState().editorDirty).toBe(false);
  });

  it('Keep editing leaves the first editor open with its draft', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Alpha!');
    expect(screen.queryByRole('form', { name: 'New item' })).toBeNull();
    expect(useUiStore.getState().editorDirty).toBe(true);
  });

  it('the toggle on a dirty editor asks and Discard closes without opening anything', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('form', { name: 'Edit Alpha' })).toBeNull();
    expect(useUiStore.getState().openEditor).toBeNull();
  });
});

describe('pressing outside the editor', () => {
  it('pointerdown outside a clean editor closes it', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Todo' }));

    expect(screen.queryByRole('form', { name: 'Edit Alpha' })).toBeNull();
    expect(useUiStore.getState().openEditor).toBeNull();
  });

  it('outside a dirty editor asks and the following click on the backdrop does not dismiss', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Todo' }));

    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    const backdrop = dialog.parentElement as HTMLElement;
    fireEvent.click(backdrop);

    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(useUiStore.getState().editorDirty).toBe(true);
  });

  it('pointerdown inside the form does nothing', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    fireEvent.pointerDown(screen.getByLabelText('Title'));

    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(useUiStore.getState().editorDirty).toBe(true);
  });

  it('pointerdown on the editor own toggle does nothing', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Edit Alpha' }));

    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(useUiStore.getState().pendingClose).toBeNull();
  });

  it('pointerdown on a grip handle leaves a clean editor open', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move Alpha' }));

    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(useUiStore.getState().openEditor).not.toBeNull();
  });

  it('pointerdown on the grip of another row also leaves a dirty editor alone', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move Beta' }));

    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(useUiStore.getState().pendingClose).toBeNull();
  });

  it('pointerdown on a grip handle does not ask about a dirty editor', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move Alpha' }));

    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(useUiStore.getState().pendingClose).toBeNull();
  });

  it('pointerdown inside an open dialog does nothing', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Keep editing' }));

    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(useUiStore.getState().pendingClose).not.toBeNull();
  });

  it('a press on another item toggles it and leaves a clean editor open', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    const before = useUiStore.getState().openEditor;

    const box = screen.getByRole('checkbox', { name: 'Mark Beta complete' });
    fireEvent.pointerDown(box);
    fireEvent.click(box);

    expect(useTodoStore.getState().todos.b.completed).toBe(true);
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(useUiStore.getState().openEditor).toBe(before);
  });

  it('a press on another item never asks about a dirty editor', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    await pressTitle('Beta');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide details for Beta' })).toBeInTheDocument();
    expect(useUiStore.getState().activeItemId).toBe('b');
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Alpha!');
    expect(useUiStore.getState().editorDirty).toBe(true);
  });

  it('a press on the toolbar clears the active item', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    expect(useUiStore.getState().activeItemId).toBe('a');

    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Todo' }));

    expect(useUiStore.getState().activeItemId).toBeNull();
  });

  it('a press inside the item own editor keeps the item selected', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));

    fireEvent.pointerDown(screen.getByLabelText('Title'));

    expect(useUiStore.getState().activeItemId).toBe('a');
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
  });

  it('a press in the root editor clears the active item and leaves the editor open', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    await pressTitle('Alpha');
    expect(useUiStore.getState().activeItemId).toBe('a');

    fireEvent.pointerDown(screen.getByLabelText('Title'));

    expect(useUiStore.getState().activeItemId).toBeNull();
    expect(screen.getByRole('form', { name: 'New item' })).toBeInTheDocument();
  });

  it('a press on the toolbar changes nothing while a dialog is open', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    expect(screen.getByRole('dialog', { name: "Delete 'Alpha'?" })).toBeInTheDocument();
    const editor = useUiStore.getState().openEditor;

    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Todo' }));

    expect(useUiStore.getState().activeItemId).toBe('a');
    expect(useUiStore.getState().openEditor).toBe(editor);
  });
});

describe('Delete while a prompt is up', () => {
  it('does not open a delete dialog on top of the unsaved-changes prompt', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }));
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    await userEvent.type(screen.getByLabelText('Title'), 'x');

    await pressTitle('Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Beta' }));
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();

    const del = screen.getByRole('button', { name: 'Delete Beta' });
    fireEvent.pointerDown(del);
    fireEvent.click(del);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: /unsaved changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /delete/i })).toBeNull();
  });
});

describe('pressing a dialog backdrop', () => {
  it('leaves the unsaved-changes prompt standing and does not re-request a close', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    await userEvent.type(screen.getByLabelText('Title'), 'x');

    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    const prompt = screen.getByRole('dialog', { name: 'Unsaved changes' });
    const pending = useUiStore.getState().pendingClose;

    fireEvent.pointerDown(prompt.parentElement as HTMLElement);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(useUiStore.getState().pendingClose).toBe(pending);
  });

  it('does not close the editor behind an open delete dialog', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    expect(screen.getByRole('dialog', { name: "Delete 'Alpha'?" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    const editor = screen.getByRole('form', { name: 'New item under Alpha' });
    expect(editor).toBeInTheDocument();

    const dialog = screen.getByRole('dialog', { name: "Delete 'Alpha'?" });
    fireEvent.pointerDown(dialog.parentElement as HTMLElement);

    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
    expect(useUiStore.getState().openEditor).not.toBeNull();
  });
});

describe('Add item under a collapsed item', () => {
  it('leaves it collapsed when a dirty editor blocks the open', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    act(() => {
      useTodoStore.getState().toggleCollapsed('a');
    });
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    await userEvent.type(screen.getByLabelText('Title'), 'x');

    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));

    expect(useTodoStore.getState().collapsed.a).toBe(true);
    expect(screen.queryByRole('form', { name: 'New item under Alpha' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
  });
});

describe('dragging around an open editor', () => {
  it('does not start a drag while the unsaved-changes prompt is open', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }));
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();

    fireEvent.pointerDown(titleOf('Beta'), MOUSE_DOWN);
    mouseMove(20);

    expect(screen.getByRole('treeitem', { name: 'Beta' })).not.toHaveAttribute('data-dragging');
    expect(screen.getByRole('tree')).not.toHaveAttribute('data-dragging');
    expect(counts(remove)).toEqual(counts(add));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('leaves a clean root editor open and still starts the drag', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }));
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(screen.getByRole('form', { name: 'New item' })).toBeInTheDocument();

    fireEvent.pointerDown(titleOf('Alpha'), MOUSE_DOWN);
    mouseMove(20);

    expect(screen.getByRole('form', { name: 'New item' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).toHaveAttribute('data-dragging', 'true');
  });
});

describe('Enter opens an editor', () => {
  it('Enter on a title while another editor has changes opens nothing and never asks', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    fireEvent.keyDown(screen.getByRole('button', { name: 'Show details for Beta' }), { key: 'Enter' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('form', { name: 'New item under Beta' })).toBeNull();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Alpha!');
  });

  it('Enter on the title of the item whose child editor is open leaves it open', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Alpha' }));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Hide details for Alpha' }), { key: 'Enter' });

    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
  });

  it('a held Enter (auto-repeat) opens nothing', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();

    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });

    expect(screen.queryByRole('form', { name: 'New item' })).toBeNull();
  });

  it('opens the New item editor and focuses the title when nothing is selected', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(screen.getByRole('form', { name: 'New item' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveFocus();
  });

  it('opens the child editor of the selected item', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
  });

  it('expands a collapsed selected item and opens its child editor', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    act(() => {
      useTodoStore.getState().toggleCollapsed('a');
    });
    renderApp();
    await pressTitle('Alpha');
    expect(useTodoStore.getState().collapsed.a).toBe(true);

    fireEvent.keyDown(document.body, { key: 'Enter' });

    // toggleCollapsed drops the key rather than storing false, so an expanded item has no entry.
    expect(useTodoStore.getState().collapsed.a).toBeUndefined();
    expect(screen.getByRole('treeitem', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
  });

  it('changes nothing while an editor is already open', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    const open = useUiStore.getState().openEditor;

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(useUiStore.getState().openEditor).toBe(open);
    expect(useUiStore.getState().pendingClose).toBeNull();
    expect(screen.getAllByRole('form')).toHaveLength(1);
  });

  it('ignores Enter on a checkbox inside an item', () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', 'a', { title: 'Beta' }));
    renderApp();
    const box = screen.getByRole('checkbox', { name: 'Mark Beta complete' });
    box.focus();

    fireEvent.keyDown(box, { key: 'Enter' });

    expect(screen.queryByRole('form')).toBeNull();
    expect(useUiStore.getState().openEditor).toBeNull();
  });

  it('ignores a bare keydown on the New item button', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    const button = screen.getByRole('button', { name: 'New item' });
    button.focus();

    fireEvent.keyDown(button, { key: 'Enter' });

    expect(screen.queryByRole('form')).toBeNull();
    expect(useUiStore.getState().openEditor).toBeNull();
  });

  it('opens the child editor from the title button without toggling details', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    const title = titleOf('Alpha');
    const expanded = title.getAttribute('aria-expanded');

    // jsdom never synthesizes the click a real browser would; preventing the default is what stops it.
    const notPrevented = fireEvent.keyDown(title, { key: 'Enter' });

    expect(notPrevented).toBe(false);
    expect(screen.getByRole('form', { name: 'New item under Alpha' })).toBeInTheDocument();
    expect(titleOf('Alpha').getAttribute('aria-expanded')).toBe(expanded);
    expect(useUiStore.getState().activeItemId).toBe('a');
  });

  it('ignores Enter with a modifier held', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();

    fireEvent.keyDown(document.body, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });

    expect(screen.queryByRole('form')).toBeNull();
  });

  it('ignores Enter while a dialog is open', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    expect(screen.getByRole('dialog', { name: "Delete 'Alpha'?" })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(screen.queryByRole('form')).toBeNull();
    expect(useUiStore.getState().openEditor).toBeNull();
  });

  it('ignores Enter during a drag', () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    act(() => {
      useDragStore.getState().start('a');
    });
    try {
      fireEvent.keyDown(document.body, { key: 'Enter' });
      expect(screen.queryByRole('form')).toBeNull();
    } finally {
      act(() => {
        useDragStore.getState().end();
      });
    }
  });
});

describe('saving from the unsaved-changes prompt', () => {
  it('Save into a collapsed parent expands it so the new editor is visible', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }), mk('c', 'b', { title: 'Gamma' }));
    useTodoStore.getState().toggleCollapsed('b');
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await pressTitle('Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Beta' }));

    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(screen.getByRole('form', { name: 'New item under Beta' })).toBeInTheDocument();
    expect(useTodoStore.getState().collapsed.b).toBeUndefined();
    expect(screen.getByRole('treeitem', { name: 'Gamma' })).toBeInTheDocument();
  });

  it('Discard into a collapsed parent expands it too', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }), mk('c', 'b', { title: 'Gamma' }));
    useTodoStore.getState().toggleCollapsed('b');
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await pressTitle('Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Beta' }));

    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));

    expect(screen.getByRole('form', { name: 'New item under Beta' })).toBeInTheDocument();
    expect(useTodoStore.getState().collapsed.b).toBeUndefined();
  });

  it('forgets a requested next editor whose item disappears while the prompt is up', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await pressTitle('Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Beta' }));
    expect(useUiStore.getState().pendingClose).toEqual({ next: { kind: 'add', id: 'b' } });

    // A background pull removes Beta.
    act(() => {
      const { todos } = useTodoStore.getState();
      const rest = Object.fromEntries(Object.entries(todos).filter(([id]) => id !== 'b'));
      useTodoStore.setState({ todos: rest });
    });

    expect(useUiStore.getState().pendingClose).toEqual({ next: null });
    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(useUiStore.getState().openEditor).toBeNull();
  });

  it('cancels the outside press that raises the prompt, so focus stays in the prompt', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));

    const cleanNotPrevented = fireEvent.pointerDown(screen.getByRole('heading', { name: 'Todo' }));
    expect(cleanNotPrevented).toBe(true);
    expect(screen.queryByRole('form')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Gamma');
    const dirtyNotPrevented = fireEvent.pointerDown(screen.getByRole('heading', { name: 'Todo' }));
    expect(dirtyNotPrevented).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
  });

  it('does not cancel a touch press that raises the prompt, so the page can still scroll', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Gamma');

    const notPrevented = fireEvent.pointerDown(screen.getByRole('heading', { name: 'Todo' }), { pointerType: 'touch' });

    expect(notPrevented).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
  });

  it('adds the new item and closes after an outside press', async () => {
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'New item' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Gamma');

    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Todo' }));

    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add item' }));

    expect(Object.values(useTodoStore.getState().todos).some((t) => t.title === 'Gamma')).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('form')).toBeNull();
    expect(useUiStore.getState().openEditor).toBeNull();
  });

  it('saves the displaced editor and opens the requested one', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');

    await pressTitle('Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Beta' }));
    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(useTodoStore.getState().todos.a.title).toBe('Alpha!');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('form', { name: 'New item under Beta' })).toBeInTheDocument();
    expect(useUiStore.getState().openEditor).toEqual({ kind: 'add', id: 'b' });
    expect(useUiStore.getState().editorDirty).toBe(false);
  });

  it('an empty title in the displaced editor keeps it open with the error', async () => {
    seed(mk('a', null, { title: 'Alpha' }), mk('b', null, { title: 'Beta' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.clear(screen.getByLabelText('Title'));

    await pressTitle('Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Add item under Beta' }));
    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(useTodoStore.getState().todos.a.title).toBe('Alpha');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required');
    expect(screen.getByLabelText('Title')).toHaveFocus();
    expect(useUiStore.getState().openEditor).toEqual({ kind: 'edit', id: 'a' });
  });
});
