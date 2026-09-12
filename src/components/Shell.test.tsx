import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Shell } from './Shell';
import { useTodoStore } from '../store/todoStore';
import { useUiStore } from '../store/uiStore';

vi.mock('../hooks/useSync', () => ({ useSync: () => undefined }));
vi.mock('../hooks/useHydrated', () => ({ useHydrated: () => false }));

beforeEach(() => {
  useTodoStore.getState().reset();
  useUiStore.getState().reset();
});

describe('Shell', () => {
  it('shows the loading copy instead of the tree before hydration', () => {
    render(<Shell />);
    expect(screen.getByText('Loading your list…')).toBeInTheDocument();
    expect(screen.queryByRole('tree')).toBeNull();
  });

  it('closes an open editor on an outside press before hydration', () => {
    render(<Shell />);
    act(() => useUiStore.getState().requestOpen({ kind: 'root' }));
    expect(screen.getByRole('form', { name: 'New item' })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(useUiStore.getState().openEditor).toBeNull();
    expect(screen.queryByRole('form', { name: 'New item' })).toBeNull();
  });
});
