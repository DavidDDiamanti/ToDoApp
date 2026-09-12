import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ColorName } from '../lib/colors';
import { normalizeTime, resolveDueDate } from '../lib/dates';
import { revealAdd } from '../store/actions';
import { useUiStore } from '../store/uiStore';
import { ColorPicker } from './ColorPicker';
import { ConfirmDialog } from './ConfirmDialog';
import { TIP } from './tips';
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

  /** Saves the draft; returns false without saving when the title is empty (error shown, title focused). */
  function trySave(): boolean {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError('Title is required');
      titleRef.current?.focus();
      return false;
    }
    const due_time = normalizeTime(dueTime);
    const due_date = resolveDueDate(dueDate.length > 0 ? dueDate : null, due_time, now());
    onSave({ title: trimmed, description: description.trim(), due_date, due_time, color });
    return true;
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (trySave()) useUiStore.getState().closeEditor();
  }

  /** Applies the close the prompt was asked for; a requested child editor is revealed like a direct open. */
  function finishPending() {
    const ui = useUiStore.getState();
    const next = ui.pendingClose?.next ?? null;
    ui.resolvePending();
    if (next !== null && next.kind === 'add') revealAdd(next.id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    // The Enter that opened this editor may still be held; its repeats must not submit it.
    if (e.key === 'Enter' && e.repeat) {
      e.preventDefault();
      return;
    }
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
          <button type="submit" className={styles.primary} title={submitLabel}>{submitLabel}</button>
          <button type="button" className={styles.secondary} title={TIP.cancel} onClick={() => useUiStore.getState().requestClose()}>Cancel</button>
        </div>
      </form>
      {asking ? (
        <ConfirmDialog
          heading="Unsaved changes"
          body="Save them, or discard them?"
          primary={{
            label: submitLabel,
            tone: 'primary',
            onClick: () => {
              const ui = useUiStore.getState();
              // A failed save leaves the title focused; keepEditing only takes the prompt away.
              if (trySave()) finishPending();
              else ui.keepEditing();
            },
          }}
          extra={{ label: 'Discard', onClick: finishPending }}
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
