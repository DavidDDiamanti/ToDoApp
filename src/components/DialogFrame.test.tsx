import { StrictMode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DialogFrame } from './DialogFrame';

function renderFrame(overrides: Partial<React.ComponentProps<typeof DialogFrame>> = {}) {
  const onClose = vi.fn();
  const view = render(
    <DialogFrame heading="Settings" onClose={onClose} {...overrides}>
      <p id="frame-body">Choose how the list looks.</p>
      <button type="button" autoFocus>
        One
      </button>
      <button type="button">Two</button>
    </DialogFrame>,
  );
  return { onClose, ...view };
}

describe('DialogFrame', () => {
  it('renders its children inside a modal dialog labelled by the heading', () => {
    renderFrame();
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('Choose how the list looks.')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['One', 'Two']);
  });

  it('describes the dialog with the id it is given and omits the attribute otherwise', () => {
    const { unmount } = renderFrame({ describedBy: 'frame-body' });
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-describedby', 'frame-body');
    unmount();
    renderFrame();
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('puts an extra className on the panel next to its own', () => {
    renderFrame({ className: 'roomy' });
    expect(screen.getByRole('dialog')).toHaveClass('dialog', 'roomy');
  });

  it('swallows a repeated Enter so a held key cannot drive the focused button', () => {
    const { onClose } = renderFrame();
    const notPrevented = fireEvent.keyDown(document, { key: 'Enter', repeat: true });
    expect(notPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape closes once and does not reach an ancestor keydown spy', async () => {
    const ancestorSpy = vi.fn();
    const onClose = vi.fn();
    render(
      <div onKeyDown={ancestorSpy}>
        <DialogFrame heading="Settings" onClose={onClose}>
          <button type="button">One</button>
        </DialogFrame>
      </div>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ancestorSpy).not.toHaveBeenCalled();
  });

  it('Escape closes it when focus is on the body', () => {
    const { onClose } = renderFrame();
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('an Escape after unmount does not reach onClose', () => {
    const { onClose, unmount } = renderFrame();
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Tab and Shift+Tab wrap across the focusable children', async () => {
    renderFrame();
    const first = screen.getByRole('button', { name: 'One' });
    const last = screen.getByRole('button', { name: 'Two' });
    expect(first).toHaveFocus();
    await userEvent.tab();
    expect(last).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('a press that starts and ends on the backdrop closes it', () => {
    const { onClose } = renderFrame();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a click alone on the backdrop does not close it', () => {
    const { onClose } = renderFrame();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a press that starts on the panel does not close it', () => {
    const { onClose } = renderFrame();
    const dialog = screen.getByRole('dialog');
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a cancelled pointer sequence does not close it on the next click', () => {
    const { onClose } = renderFrame();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.pointerDown(backdrop);
    fireEvent.pointerCancel(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('DialogFrame focus restore', () => {
  it('returns focus to the element that was focused before it opened', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = renderFrame();
    expect(screen.getByRole('button', { name: 'One' })).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('does not throw when the opener was removed before it closed', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = renderFrame();
    opener.remove();
    expect(() => unmount()).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves focus alone when a handler moved it elsewhere', () => {
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = renderFrame();
    elsewhere.focus();
    expect(elsewhere).toHaveFocus();

    unmount();
    expect(elsewhere).toHaveFocus();
    elsewhere.remove();
    opener.remove();
  });

  it('does not steal focus back during a simulated StrictMode remount', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    render(
      <StrictMode>
        <DialogFrame heading="Settings" onClose={vi.fn()}>
          <button type="button" autoFocus>
            One
          </button>
        </DialogFrame>
      </StrictMode>,
    );

    expect(screen.getByRole('button', { name: 'One' })).toHaveFocus();
    opener.remove();
  });
});
