import { useId } from 'react';
import { getDescendantIds, type ChildrenMap } from '../domain/tree';
import type { Todo } from '../types';
import styles from './MoveMenu.module.css';

export function moveTargets(_todos: Record<string, Todo>, map: ChildrenMap, id: string): { id: string; label: string; depth: number }[] {
  const excluded = new Set<string>([id, ...getDescendantIds(map, id)]);
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const t of map.get(parentId) ?? []) {
      if (excluded.has(t.id)) continue;
      out.push({ id: t.id, label: t.title, depth });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

interface Props {
  todo: Todo;
  map: ChildrenMap;
  todos: Record<string, Todo>;
  onMove: (parentId: string | null) => void;
  onCancel: () => void;
}

export function MoveMenu({ todo, map, todos, onMove, onCancel }: Props) {
  const id = useId();
  const targets = moveTargets(todos, map, todo.id);
  return (
    <div
      className={styles.menu}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <label className={styles.label} htmlFor={`${id}-select`}>Move {todo.title} to</label>
      <select
        id={`${id}-select`}
        className={styles.select}
        defaultValue="?"
        onChange={(e) => {
          const v = e.target.value;
          if (v === '?') return;
          onMove(v === '' ? null : v);
        }}
        autoFocus
      >
        <option value="?" disabled>Choose where to move it</option>
        <option value="">Top level</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>{`${'— '.repeat(t.depth)}${t.label}`}</option>
        ))}
      </select>
      <button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button>
    </div>
  );
}
