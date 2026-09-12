import { StrictMode } from 'react';
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
  it('swallows a repeated Enter so a held key cannot drive the focused button', () => {
    const { primary } = renderDialog();
    const notPrevented = fireEvent.keyDown(document, { key: 'Enter', repeat: true });
    expect(notPrevented).toBe(false);
    expect(primary.onClick).not.toHaveBeenCalled();
  });

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

describe('ConfirmDialog focus and dismissal', () => {
  it('restores focus to the element that was focused before it opened', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();
    expect(opener).toHaveFocus();

    const { unmount } = render(
      <ConfirmDialog
        heading="Delete 'Alpha'?"
        body="It will be removed from your list."
        primary={{ label: 'Delete', tone: 'danger', onClick: vi.fn() }}
        secondary={{ label: 'Cancel', onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('does not throw when the opener was removed before it closed', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <ConfirmDialog
        heading="Delete 'Alpha'?"
        body="It will be removed from your list."
        primary={{ label: 'Delete', tone: 'danger', onClick: vi.fn() }}
        secondary={{ label: 'Cancel', onClick: vi.fn() }}
      />,
    );
    opener.remove();
    expect(() => unmount()).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });

  it('Escape closes the dialog when focus is on the body', () => {
    const { secondary } = renderDialog();
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(secondary.onClick).toHaveBeenCalledTimes(1);
  });

  it('pointerdown on the panel then click on the backdrop does not dismiss', () => {
    const { secondary } = renderDialog();
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement as HTMLElement;
    fireEvent.pointerDown(dialog);
    fireEvent.click(backdrop);
    expect(secondary.onClick).not.toHaveBeenCalled();
  });

  it('a cancelled pointer sequence does not dismiss on the next click', () => {
    const { secondary } = renderDialog();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.pointerDown(backdrop);
    fireEvent.pointerCancel(backdrop);
    fireEvent.click(backdrop);
    expect(secondary.onClick).not.toHaveBeenCalled();
  });

  it('Tab and Shift+Tab cycle in the two-button dialog', async () => {
    renderDialog();
    const first = screen.getByRole('button', { name: 'Delete' });
    const last = screen.getByRole('button', { name: 'Cancel' });
    expect(first).toHaveFocus();
    await userEvent.tab();
    expect(last).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
  });
});

describe('ConfirmDialog focus restore guards', () => {
  it('does not steal focus back during a simulated StrictMode remount', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    render(
      <StrictMode>
        <ConfirmDialog
          heading="Delete 'Alpha'?"
          body="It will be removed from your list."
          primary={{ label: 'Delete', tone: 'danger', onClick: vi.fn() }}
          secondary={{ label: 'Cancel', onClick: vi.fn() }}
        />
      </StrictMode>,
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    opener.remove();
  });

  it('leaves focus alone when the secondary handler moved it elsewhere', () => {
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <ConfirmDialog
        heading="Unsaved changes"
        body="Your unsaved edits will be lost."
        primary={{ label: 'Discard', tone: 'danger', onClick: vi.fn() }}
        secondary={{ label: 'Keep editing', onClick: () => elsewhere.focus() }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(elsewhere).toHaveFocus();

    unmount();
    expect(elsewhere).toHaveFocus();
    elsewhere.remove();
    opener.remove();
  });

  it('an Escape after unmount does not reach the secondary handler', () => {
    const secondary = { label: 'Cancel', onClick: vi.fn() };
    const { unmount } = render(
      <ConfirmDialog
        heading="Delete 'Alpha'?"
        body="It will be removed from your list."
        primary={{ label: 'Delete', tone: 'danger', onClick: vi.fn() }}
        secondary={secondary}
      />,
    );
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(secondary.onClick).not.toHaveBeenCalled();
  });
});
