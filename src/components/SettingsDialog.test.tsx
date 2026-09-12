import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';
import { TodoTree } from './TodoTree';
import { TIP } from './tips';
import { useApplySettings } from '../hooks/useApplySettings';
import { useEnterToCreate } from '../hooks/useEnterToCreate';
import { useOutsidePress } from '../hooks/useOutsidePress';
import { useSettingsStore } from '../store/settingsStore';
import { useTodoStore } from '../store/todoStore';
import { useUiStore } from '../store/uiStore';
import { mk } from '../test/fixtures';
import { pressTitle } from '../test/press';

/**
 * jsdom has no matchMedia; the switch reads the device preference through useSystemDark.
 * Same shape as the stub in useSystemDark.test.tsx (copied, not imported: test files are not shared modules).
 */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    addEventListener(type: string, listener: (event: MediaQueryListEvent) => void) {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener(type: string, listener: (event: MediaQueryListEvent) => void) {
      if (type === 'change') listeners.delete(listener);
    },
  };
  vi.stubGlobal('matchMedia', () => mql);
  return {
    emit(matches: boolean) {
      mql.matches = matches;
      const event = { matches, media: mql.media };
      act(() => {
        for (const listener of [...listeners]) listener(event as MediaQueryListEvent);
      });
    },
  };
}

/** The global input hooks live in Shell, which this harness does not render; mount them explicitly instead. */
function GlobalInput() {
  useOutsidePress();
  useEnterToCreate();
  return null;
}

/** App mounts this above AuthGate; the dialog itself never writes to the document. */
function ApplySettings() {
  useApplySettings();
  return null;
}

function renderApp({ applySettings = false }: { applySettings?: boolean } = {}) {
  return render(
    <>
      {applySettings ? <ApplySettings /> : null}
      <GlobalInput />
      <Toolbar />
      <TodoTree />
    </>,
  );
}

function seed(...todos: ReturnType<typeof mk>[]) {
  const s = useTodoStore.getState();
  s.reset();
  for (const t of todos) s.upsertTodo(t, false);
}

function wheel() {
  return screen.getByRole('button', { name: 'Settings' });
}

async function openSettings() {
  await userEvent.click(wheel());
  return screen.getByRole('dialog', { name: 'Settings' });
}

beforeEach(() => {
  localStorage.clear();
  useTodoStore.getState().reset();
  useUiStore.getState().reset();
  act(() => {
    useSettingsStore.getState().reset();
  });
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-gap');
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-gap');
});

describe('the settings wheel', () => {
  it('sits between Hide completed and New item, labelled and exempt from closing editors', () => {
    stubMatchMedia(false);
    renderApp();
    const button = wheel();
    expect(button).toHaveAttribute('title', TIP.settings);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('data-keeps-editor');
    const controls = [...document.querySelectorAll('header button, header input[type="checkbox"]')];
    expect(controls.map((c) => c.getAttribute('aria-label') ?? c.textContent)).toEqual([
      'Hide completed',
      'Settings',
      'New item',
      'Sign out',
    ]);
  });

  it('opens the dialog, flips aria-expanded, and Done closes it and restores focus', async () => {
    stubMatchMedia(false);
    renderApp();
    const dialog = await openSettings();
    expect(wheel()).toHaveAttribute('aria-expanded', 'true');
    const done = within(dialog).getByRole('button', { name: 'Done' });
    expect(done).toHaveAttribute('title', TIP.done);

    await userEvent.click(done);

    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    expect(wheel()).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(wheel());
  });

  it('Escape closes it and restores focus to the wheel', async () => {
    stubMatchMedia(false);
    renderApp();
    await openSettings();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    expect(document.activeElement).toBe(wheel());
  });

  it('a press that starts and ends on the backdrop closes it', async () => {
    stubMatchMedia(false);
    renderApp();
    const dialog = await openSettings();
    const backdrop = dialog.parentElement as HTMLElement;

    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);

    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });
});

describe('night mode', () => {
  it('shows the resolved device theme while no override is set', async () => {
    stubMatchMedia(true);
    renderApp();
    const dialog = await openSettings();

    const toggle = within(dialog).getByRole('switch', { name: 'Night mode' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAttribute('title', TIP.nightMode);
    expect(within(dialog).getByText('Following the device setting')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Use device setting' })).toBeNull();
  });

  it('follows a device change while the theme is system', async () => {
    const media = stubMatchMedia(false);
    renderApp();
    const dialog = await openSettings();
    expect(within(dialog).getByRole('switch', { name: 'Night mode' })).toHaveAttribute('aria-checked', 'false');

    media.emit(true);

    expect(within(dialog).getByRole('switch', { name: 'Night mode' })).toHaveAttribute('aria-checked', 'true');
  });

  it('toggling off a dark device sets an explicit light theme and offers the device setting back', async () => {
    stubMatchMedia(true);
    renderApp();
    const dialog = await openSettings();

    await userEvent.click(within(dialog).getByRole('switch', { name: 'Night mode' }));

    expect(useSettingsStore.getState().theme).toBe('light');
    expect(within(dialog).getByRole('switch', { name: 'Night mode' })).toHaveAttribute('aria-checked', 'false');
    expect(within(dialog).queryByText('Following the device setting')).toBeNull();
    const back = within(dialog).getByRole('button', { name: 'Use device setting' });
    expect(back).toHaveAttribute('title', TIP.useDevice);

    await userEvent.click(back);

    expect(useSettingsStore.getState().theme).toBe('system');
    expect(within(dialog).getByRole('switch', { name: 'Night mode' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByText('Following the device setting')).toBeInTheDocument();
  });

  it('toggling on a light device sets an explicit dark theme', async () => {
    stubMatchMedia(false);
    renderApp();
    const dialog = await openSettings();

    await userEvent.click(within(dialog).getByRole('switch', { name: 'Night mode' }));

    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(within(dialog).getByRole('switch', { name: 'Night mode' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('gap between items', () => {
  it('reflects the stored gap and puts the chosen one on the document', async () => {
    stubMatchMedia(false);
    act(() => {
      useSettingsStore.getState().setGap('small');
    });
    renderApp({ applySettings: true });
    const dialog = await openSettings();
    const group = within(within(dialog).getByRole('group', { name: 'Gap between items' }));
    expect(group.getByRole('radio', { name: 'Small' })).toBeChecked();
    expect(group.getByRole('radio', { name: 'Medium' })).not.toBeChecked();

    await userEvent.click(group.getByRole('radio', { name: 'Large' }));

    expect(useSettingsStore.getState().gap).toBe('large');
    expect(group.getByRole('radio', { name: 'Large' })).toBeChecked();
    expect(document.documentElement).toHaveAttribute('data-gap', 'large');
  });
});

describe('settings and an open editor', () => {
  it('opens over a dirty editor without prompting, and deselects the item', async () => {
    stubMatchMedia(false);
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await pressTitle('Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await userEvent.type(screen.getByLabelText('Title'), '!');
    expect(useUiStore.getState().activeItemId).toBe('a');

    await openSettings();

    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(screen.getByRole('form', { name: 'Edit Alpha' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Alpha!');
    expect(useUiStore.getState().pendingClose).toBeNull();
    expect(useUiStore.getState().activeItemId).toBeNull();
  });

  it('Enter while settings is open opens nothing', async () => {
    stubMatchMedia(false);
    seed(mk('a', null, { title: 'Alpha' }));
    renderApp();
    await openSettings();

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(useUiStore.getState().openEditor).toBeNull();
    expect(screen.queryByRole('form', { name: 'New item' })).toBeNull();
  });
});
