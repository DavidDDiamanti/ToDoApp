import { useState } from 'react';
import type { CSSProperties } from 'react';
import { formatDue, isOverdue } from '../lib/dates';
import { PALETTE } from '../lib/colors';
import type { ChildrenMap } from '../domain/tree';
import { addTodo, editTodo, moveTodoTo, removeTodo, toggleTodo } from '../store/actions';
import { useTodoStore } from '../store/todoStore';
import type { Todo } from '../types';
import { ChevronIcon, MoveIcon, PencilIcon, PlusIcon, TrashIcon } from './icons';
import { visibleChildren } from './TodoTree';
import { TodoEditor } from './TodoEditor';
import { DeleteDialog } from './DeleteDialog';
import { MoveMenu } from './MoveMenu';
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
  const todos = useTodoStore((s) => s.todos);
  const [showDetails, setShowDetails] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'add' | 'move' | 'delete'>('view');

  const children = visibleChildren(map, todo.id, hideCompleted);
  const hasChildren = (map.get(todo.id)?.length ?? 0) > 0;
  const overdue = isOverdue(todo, new Date());
  const railColor = PALETTE[todo.color].hex;

  return (
    <li
      role="treeitem"
      aria-label={todo.title}
      aria-expanded={hasChildren ? !collapsed : undefined}
      data-overdue={overdue ? 'true' : undefined}
      data-details={showDetails ? 'true' : undefined}
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
            <time
              dateTime={todo.due_time !== null ? `${todo.due_date}T${todo.due_time}` : todo.due_date}
              className={`${styles.due} ${overdue ? styles.overdue : ''}`}
            >
              {formatDue(todo.due_date, todo.due_time)}
            </time>
          ) : null}
        </button>

        <div className={styles.actions}>
          <button type="button" className={styles.iconButton} aria-label={`Edit ${todo.title}`} onClick={() => setMode('edit')}><PencilIcon /></button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Add item under ${todo.title}`}
            onClick={() => { setMode('add'); if (collapsed) toggleCollapsed(todo.id); }}
          >
            <PlusIcon />
          </button>
          <button type="button" className={styles.iconButton} aria-label={`Move ${todo.title}`} onClick={() => setMode('move')}><MoveIcon /></button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Delete ${todo.title}`}
            onClick={() => (hasChildren ? setMode('delete') : removeTodo(todo.id, 'subtree'))}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {mode === 'edit' ? (
        <TodoEditor
          initial={{ title: todo.title, description: todo.description, due_date: todo.due_date, due_time: todo.due_time, color: todo.color }}
          heading={`Edit ${todo.title}`}
          submitLabel="Save changes"
          onSave={(v) => { editTodo(todo.id, v); setMode('view'); }}
          onCancel={() => setMode('view')}
        />
      ) : null}
      {mode === 'add' ? (
        <TodoEditor
          initial={{ title: '', description: '', due_date: null, due_time: null, color: todo.color }}
          heading={`New item under ${todo.title}`}
          submitLabel="Add item"
          onSave={(v) => { addTodo(v, todo.id); setMode('view'); }}
          onCancel={() => setMode('view')}
        />
      ) : null}
      {mode === 'move' ? (
        <MoveMenu todo={todo} map={map} todos={todos} onMove={(p) => { moveTodoTo(todo.id, p); setMode('view'); }} onCancel={() => setMode('view')} />
      ) : null}
      {mode === 'delete' ? (
        <DeleteDialog
          title={todo.title}
          onDeleteAll={() => { removeTodo(todo.id, 'subtree'); setMode('view'); }}
          onPromote={() => { removeTodo(todo.id, 'promote'); setMode('view'); }}
          onCancel={() => setMode('view')}
        />
      ) : null}

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
