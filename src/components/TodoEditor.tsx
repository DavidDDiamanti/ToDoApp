import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ColorName } from '../lib/colors';
import { ColorPicker } from './ColorPicker';
import styles from './TodoEditor.module.css';

export interface EditorValues {
  title: string;
  description: string;
  due_date: string | null;
  color: ColorName;
}

interface Props {
  initial: EditorValues;
  heading: string;
  submitLabel: string;
  onSave: (values: EditorValues) => void;
  onCancel: () => void;
}

export function TodoEditor({ initial, heading, submitLabel, onSave, onCancel }: Props) {
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [dueDate, setDueDate] = useState(initial.due_date ?? '');
  const [color, setColor] = useState<ColorName>(initial.color);
  const [error, setError] = useState<string | null>(null);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError('Title is required');
      titleRef.current?.focus();
      return;
    }
    onSave({ title: trimmed, description: description.trim(), due_date: dueDate.length > 0 ? dueDate : null, color });
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} onKeyDown={onKeyDown} aria-label={heading}>
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

      <label className={styles.label} htmlFor={`${id}-due`}>Due date</label>
      <input id={`${id}-due`} className={styles.input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

      <ColorPicker value={color} onChange={setColor} idPrefix={id} />

      <div className={styles.buttons}>
        <button type="submit" className={styles.primary}>{submitLabel}</button>
        <button type="button" className={styles.secondary} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
