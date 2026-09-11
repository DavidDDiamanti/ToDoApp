import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const primary = { label: 'Delete', tone: 'danger' as const, onClick: vi.fn() };
  const secondary = { label: 'Cancel', onClick: vi.fn() };
  render(
    <ConfirmDialog
      heading="Delete 'Alpha'?"
      body="It will be removed from your list."
      primary={primary}
      secondary={secondary}
      {...overrides}
    />,
  );
  return { primary, secondary };
}

describe('ConfirmDialog', () => {
  it('renders heading, body and buttons in order', () => {
    renderDialog({ extra: { label: 'Keep children, move them up', onClick: vi.fn() } });
    const dialog = screen.getByRole('dialog', { name: "Delete 'Alpha'?" });
    expect(within(dialog).getByText('It will be removed from your list.')).toBeInTheDocument();
    const buttons = within(dialog).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Delete', 'Keep children, move them up', 'Cancel']);
  });

  it('omits extra when absent', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Delete', 'Cancel']);
  });

  it('every button has a title equal to its label', () => {
    renderDialog({ extra: { label: 'Keep children, move them up', onClick: vi.fn() } });
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('title', button.textContent);
    }
  });

  it('primary carries the danger or primary class', () => {
    const { unmount } = render(
      <ConfirmDialog
        heading="H"
        body="B"
        primary={{ label: 'Go', tone: 'danger', onClick: vi.fn() }}
        secondary={{ label: 'Cancel', onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('danger');
    unmount();
    render(
      <ConfirmDialog
        heading="H"
        body="B"
        primary={{ label: 'Go', tone: 'primary', onClick: vi.fn() }}
        secondary={{ label: 'Cancel', onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('primary');
  });

  it('Escape calls secondary and does not reach an ancestor keydown spy', async () => {
    const ancestorSpy = vi.fn();
    const secondary = { label: 'Cancel', onClick: vi.fn() };
    render(
      <div onKeyDown={ancestorSpy}>
        <ConfirmDialog
          heading="Delete 'Alpha'?"
          body="It will be removed from your list."
          primary={{ label: 'Delete', tone: 'danger', onClick: vi.fn() }}
          secondary={secondary}
        />
      </div>,
    );
    await userEvent.keyboard('{Escape}');
    expect(secondary.onClick).toHaveBeenCalledTimes(1);
    expect(ancestorSpy).not.toHaveBeenCalled();
  });

  it('pointerdown then click on the backdrop dismisses', () => {
    const { secondary } = renderDialog();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(secondary.onClick).toHaveBeenCalledTimes(1);
  });

  it('click alone does not dismiss', () => {
    const { secondary } = renderDialog();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.click(backdrop);
    expect(secondary.onClick).not.toHaveBeenCalled();
  });

  it('Tab and Shift+Tab cycle', async () => {
    renderDialog({ extra: { label: 'Keep children, move them up', onClick: vi.fn() } });
    const first = screen.getByRole('button', { name: 'Delete' });
    const last = screen.getByRole('button', { name: 'Cancel' });
    expect(first).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
  });
});
