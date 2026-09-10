import { useId, useRef, type KeyboardEvent } from 'react';
import styles from './DeleteDialog.module.css';

interface Props {
  title: string;
  onDeleteAll: () => void;
  onPromote: () => void;
  onCancel: () => void;
}

export function DeleteDialog({ title, onDeleteAll, onPromote, onCancel }: Props) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
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

  return (
    <div className={styles.backdrop} onClick={onCancel} onKeyDown={onKeyDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-h`}
        className={styles.dialog}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={`${id}-h`} className={styles.heading}>Delete {title}?</h2>
        <p className={styles.body}>This item has children. What should happen to them?</p>
        <div className={styles.buttons}>
          <button type="button" className={styles.danger} onClick={onDeleteAll} autoFocus>Delete children too</button>
          <button type="button" className={styles.secondary} onClick={onPromote}>Keep children, move them up</button>
          <button type="button" className={styles.secondary} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
