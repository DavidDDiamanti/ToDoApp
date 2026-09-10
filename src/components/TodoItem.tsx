import { useState } from 'react';
import type { CSSProperties } from 'react';
import { isOverdue, todayISO } from '../lib/dates';
import { PALETTE } from '../lib/colors';
import type { ChildrenMap } from '../domain/tree';
import { toggleTodo } from '../store/actions';
import { useTodoStore } from '../store/todoStore';
import type { Todo } from '../types';
import { ChevronIcon, MoveIcon, PencilIcon, PlusIcon, TrashIcon } from './icons';
import { visibleChildren } from './TodoTree';
import styles from './TodoItem.module.css';

interface Props {
  todo: Todo;
  map: ChildrenMap;
  depth: number;
}

export function TodoItem({ todo, map, depth }: Props) {
  const collapsed = useTodoStore((s) => s.collapsed[todo.id] === true);
  const hideCompleted = useTodoStore((s) => s.hideCompleted);
  const toggleCollapsed = useTodoStore((s) => s.toggleCollapsed);
  const [showDetails, setShowDetails] = useState(false);

  const children = visibleChildren(map, todo.id, hideCompleted);
  const hasChildren = (map.get(todo.id)?.length ?? 0) > 0;
  const overdue = isOverdue(todo, todayISO());
  const railColor = PALETTE[todo.color].hex;

  return (
    <li
      role="treeitem"
      aria-label={todo.title}
      aria-expanded={hasChildren ? !collapsed : undefined}
      aria-selected={false}
      data-overdue={overdue ? 'true' : undefined}
      data-completed={todo.completed ? 'true' : undefined}
      className={styles.item}
      style={{ '--item-color': railColor } as CSSProperties}
    >
      <div className={styles.row}>
        {hasChildren ? (
          <button
            type="button"
            className={`${styles.iconButton} ${collapsed ? '' : styles.open}`}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${todo.title}`}
            onClick={() => toggleCollapsed(todo.id)}
          >
            <ChevronIcon />
          </button>
        ) : (
          <span className={styles.spacer} />
        )}

        <input
          type="checkbox"
          className={styles.checkbox}
          checked={todo.completed}
          aria-label={`Mark ${todo.title} ${todo.completed ? 'incomplete' : 'complete'}`}
          onChange={() => toggleTodo(todo.id)}
        />

        <button
          type="button"
          className={styles.titleButton}
          aria-label={`${showDetails ? 'Hide' : 'Show'} details for ${todo.title}`}
          aria-expanded={showDetails}
          onClick={() => setShowDetails((v) => !v)}
        >
          <span className={styles.title}>{todo.title}</span>
          {todo.due_date !== null ? (
            <span className={`${styles.due} ${overdue ? styles.overdue : ''}`}>{todo.due_date}</span>
          ) : null}
        </button>

        <div className={styles.actions}>
          <button type="button" className={styles.iconButton} aria-label={`Edit ${todo.title}`}><PencilIcon /></button>
          <button type="button" className={styles.iconButton} aria-label={`Add item under ${todo.title}`}><PlusIcon /></button>
          <button type="button" className={styles.iconButton} aria-label={`Move ${todo.title}`}><MoveIcon /></button>
          <button type="button" className={styles.iconButton} aria-label={`Delete ${todo.title}`}><TrashIcon /></button>
        </div>
      </div>

      {showDetails ? (
        <div className={styles.details}>
          {todo.description.length > 0 ? <p className={styles.description}>{todo.description}</p> : <p className={styles.noDescription}>No description yet.</p>}
        </div>
      ) : null}

      {hasChildren && !collapsed && children.length > 0 ? (
        <ul role="group" className={styles.children}>
          {children.map((c) => (
            <TodoItem key={c.id} todo={c} map={map} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
