import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
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

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({ heading, body, primary, extra, secondary }: ConfirmDialogProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropPressed = useRef(false);
  const openerRef = useRef<Element | null>(document.activeElement);
  const secondaryRef = useRef(secondary);
  secondaryRef.current = secondary;

  useEffect(() => {
    const opener = openerRef.current;
    const panel = panelRef.current;
    return () => {
      // StrictMode simulates an unmount without touching the DOM, so a still-connected panel means we are staying.
      if (panel !== null && panel.isConnected) return;
      const active = document.activeElement;
      // Someone moved focus on purpose (Keep editing refocusing the title): leave it where they put it.
      const ours = active === null || active === document.body || (panel !== null && panel.contains(active));
      if (!ours) return;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onDocumentKeyDown = (e: KeyboardEvent) => {
      // The Enter that raised this dialog may still be held; its repeats must not press the focused button.
      if (e.key === 'Enter' && e.repeat) {
        e.preventDefault();
        return;
      }
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      secondaryRef.current.onClick();
    };
    document.addEventListener('keydown', onDocumentKeyDown, true);
    return () => document.removeEventListener('keydown', onDocumentKeyDown, true);
  }, []);

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    e.stopPropagation();
    if (!panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
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
    backdropPressed.current = false;
    if (e.target === e.currentTarget) backdropPressed.current = true;
  }

  function onBackdropPointerCancel() {
    backdropPressed.current = false;
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
      onPointerCancel={onBackdropPointerCancel}
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
