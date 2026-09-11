import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ColorName } from '../lib/colors';
import { normalizeTime, resolveDueDate } from '../lib/dates';
import { useUiStore } from '../store/uiStore';
import { ColorPicker } from './ColorPicker';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './TodoEditor.module.css';

export interface EditorValues {
  title: string;
  description: string;
  due_date: string | null;
  due_time: string | null;
  color: ColorName;
}

export interface EditorDraft {
  title: string;
  description: string;
  dueDate: string;
  dueTime: string;
  color: ColorName;
}

interface Props {
  initial: EditorValues;
  heading: string;
  submitLabel: string;
  onSave: (values: EditorValues) => void;
  now?: () => Date;
}

const defaultNow = () => new Date();

export function isDirty(initial: EditorValues, draft: EditorDraft): boolean {
  return (
    draft.title.trim() !== initial.title.trim() ||
    draft.description.trim() !== initial.description.trim() ||
    draft.dueDate !== (initial.due_date ?? '') ||
    draft.dueTime !== (initial.due_time ?? '') ||
    draft.color !== initial.color
  );
}

export function TodoEditor({ initial, heading, submitLabel, onSave, now = defaultNow }: Props) {
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [dueDate, setDueDate] = useState(initial.due_date ?? '');
  const [dueTime, setDueTime] = useState(initial.due_time ?? '');
  const [color, setColor] = useState<ColorName>(initial.color);
  const [error, setError] = useState<string | null>(null);
  const asking = useUiStore((s) => s.pendingClose !== null);

  const dirty = isDirty(initial, { title, description, dueDate, dueTime, color });

  useEffect(() => {
    useUiStore.getState().setDirty(dirty);
  }, [dirty]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError('Title is required');
      titleRef.current?.focus();
      return;
    }
    const due_time = normalizeTime(dueTime);
    const due_date = resolveDueDate(dueDate.length > 0 ? dueDate : null, due_time, now());
    onSave({ title: trimmed, description: description.trim(), due_date, due_time, color });
    useUiStore.getState().closeEditor();
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      useUiStore.getState().requestClose();
    }
  }

  return (
    <>
      <form className={styles.form} data-editor-root onSubmit={submit} onKeyDown={onKeyDown} aria-label={heading}>
        <h2 className={styles.heading}>{heading}</h2>

        <label className={styles.label} htmlFor={`${id}-title`}>Title</label>
        <input
          id={`${id}-title`}
          ref={titleRef}
          className={styles.input}
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError(null); }}
          autoFocus
          aria-invalid={error !== null}
          aria-describedby={error !== null ? `${id}-error` : undefined}
        />
        {error !== null ? <p id={`${id}-error`} className={styles.error} role="alert">{error}</p> : null}

        <label className={styles.label} htmlFor={`${id}-description`}>Description</label>
        <textarea id={`${id}-description`} className={styles.textarea} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />

        <div className={styles.dateRow}>
          <div>
            <label className={styles.label} htmlFor={`${id}-due`}>Due date</label>
            <input id={`${id}-due`} className={styles.input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className={styles.label} htmlFor={`${id}-due-time`}>Due time</label>
            <input id={`${id}-due-time`} className={styles.input} type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </div>
        </div>

        <ColorPicker value={color} onChange={setColor} idPrefix={id} />

        <div className={styles.buttons}>
          <button type="submit" className={styles.primary}>{submitLabel}</button>
          <button type="button" className={styles.secondary} onClick={() => useUiStore.getState().requestClose()}>Cancel</button>
        </div>
      </form>
      {asking ? (
        <ConfirmDialog
          heading="Discard changes?"
          body="Your unsaved edits will be lost."
          primary={{ label: 'Discard', tone: 'danger', onClick: () => useUiStore.getState().confirmDiscard() }}
          secondary={{
            label: 'Keep editing',
            onClick: () => {
              useUiStore.getState().keepEditing();
              titleRef.current?.focus();
            },
          }}
        />
      ) : null}
    </>
  );
}
