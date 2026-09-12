import { useId } from 'react';
import { DialogFrame } from './DialogFrame';
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
  return (
    <DialogFrame heading={heading} describedBy={`${id}-b`} onClose={secondary.onClick}>
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
    </DialogFrame>
  );
}
