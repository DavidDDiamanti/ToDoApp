import { useId } from 'react';
import styles from './DeleteDialog.module.css';

interface Props {
  title: string;
  onDeleteAll: () => void;
  onPromote: () => void;
  onCancel: () => void;
}

export function DeleteDialog({ title, onDeleteAll, onPromote, onCancel }: Props) {
  const id = useId();
  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby={`${id}-h`} className={styles.dialog} onClick={(e) => e.stopPropagation()}>
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
