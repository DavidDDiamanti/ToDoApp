import { useEffect } from 'react';
import { addTodo } from '../store/actions';
import { useAuthStore } from '../store/authStore';
import { useSyncStatus } from '../store/syncStatusStore';
import { useTodoStore } from '../store/todoStore';
import { useUiStore } from '../store/uiStore';
import { PlusIcon } from './icons';
import { TodoEditor } from './TodoEditor';
import styles from './Toolbar.module.css';

const LABELS = { synced: 'Synced', pending: 'Saving…', offline: 'Offline', error: 'Sync failed' } as const;

export function Toolbar() {
  const hideCompleted = useTodoStore((s) => s.hideCompleted);
  const setHideCompleted = useTodoStore((s) => s.setHideCompleted);
  const signOut = useAuthStore((s) => s.signOut);
  const sync = useSyncStatus((s) => s.state);
  const adding = useUiStore((s) => s.openEditor !== null && s.openEditor.kind === 'root');

  useEffect(
    () => () => {
      const key = useUiStore.getState().openEditor;
      if (key !== null && key.kind === 'root') useUiStore.getState().closeEditor();
    },
    [],
  );

  return (
    <header className={styles.bar}>
      <div className={styles.row}>
        <h1 className={styles.brand}>Todo</h1>
        <span className={styles.status} data-state={sync} aria-live="polite">{LABELS[sync]}</span>
        <label className={styles.toggle}>
          <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} aria-label="Hide completed" />
          <span>Hide completed</span>
        </label>
        <button
          type="button"
          className={styles.primary}
          data-editor-toggle
          aria-expanded={adding}
          onClick={() => useUiStore.getState().requestOpen({ kind: 'root' })}
        >
          <PlusIcon />
          <span>New item</span>
        </button>
        <button type="button" className={styles.secondary} onClick={() => void signOut()}>Sign out</button>
      </div>
      {adding ? (
        <TodoEditor
          initial={{ title: '', description: '', due_date: null, due_time: null, color: 'slate' }}
          heading="New item"
          submitLabel="Add item"
          onSave={(v) => { addTodo(v, null); useUiStore.getState().closeEditor(); }}
          onCancel={() => useUiStore.getState().requestClose()}
        />
      ) : null}
    </header>
  );
}
