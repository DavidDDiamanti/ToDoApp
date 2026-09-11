import { useId, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import styles from './ConfirmDialog.module.css';

interface DialogAction {
  label: string;
  onClick(): void;
}

interface ConfirmDialogProps {
  heading: string;
  body: string;
  primary: DialogAction & { tone: 'danger' | 'primary' };
  extra?: DialogAction;
  secondary: DialogAction;
}

export function ConfirmDialog({ heading, body, primary, extra, secondary }: ConfirmDialogProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropPressed = useRef(false);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      secondary.onClick();
      return;
    }
    if (e.key !== 'Tab') return;
    e.stopPropagation();
    if (!panelRef.current) return;
    const buttons = Array.from(panelRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onBackdropPointerDown(e: PointerEvent<HTMLDivElement>) {
    backdropPressed.current = e.target === e.currentTarget;
  }

  function onBackdropClick(e: MouseEvent<HTMLDivElement>) {
    const dismiss = backdropPressed.current && e.target === e.currentTarget;
    backdropPressed.current = false;
    if (dismiss) secondary.onClick();
  }

  return (
    <div
      className={styles.backdrop}
      onPointerDown={onBackdropPointerDown}
      onClick={onBackdropClick}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-h`}
        aria-describedby={`${id}-b`}
        className={styles.dialog}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={`${id}-h`} className={styles.heading}>{heading}</h2>
        <p id={`${id}-b`} className={styles.body}>{body}</p>
        <div className={styles.buttons}>
          <button
            type="button"
            className={primary.tone === 'danger' ? styles.danger : styles.primary}
            title={primary.label}
            onClick={primary.onClick}
            autoFocus
          >
            {primary.label}
          </button>
          {extra !== undefined ? (
            <button type="button" className={styles.secondary} title={extra.label} onClick={extra.onClick}>
              {extra.label}
            </button>
          ) : null}
          <button type="button" className={styles.secondary} title={secondary.label} onClick={secondary.onClick}>
            {secondary.label}
          </button>
        </div>
      </div>
    </div>
  );
}
