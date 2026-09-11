import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { formatDue, isOverdue } from '../lib/dates';
import { PALETTE } from '../lib/colors';
import { buildChildrenMap, type ChildrenMap } from '../domain/tree';
import { describePlacement, keyMovePlacement, type MoveKey } from '../domain/place';
import { useDragStore } from '../dnd/dragStore';
import { addTodo, editTodo, moveTodoTo, removeTodo, toggleTodo } from '../store/actions';
import { useTodoStore } from '../store/todoStore';
import type { Todo } from '../types';
import { ChevronIcon, GripIcon, PencilIcon, PlusIcon, TrashIcon } from './icons';
import { visibleChildren, type TreeContext } from './TodoTree';
import { TodoEditor } from './TodoEditor';
import { DeleteDialog } from './DeleteDialog';
import styles from './TodoItem.module.css';

interface Props {
  todo: Todo;
  map: ChildrenMap;
  depth: number;
  tree: TreeContext;
}

function moveKeyFromArrow(key: string): MoveKey | null {
  if (key === 'ArrowUp') return 'up';
  if (key === 'ArrowDown') return 'down';
  if (key === 'ArrowLeft') return 'left';
  if (key === 'ArrowRight') return 'right';
  return null;
}

export function TodoItem({ todo, map, depth, tree }: Props) {
  const collapsed = useTodoStore((s) => s.collapsed[todo.id] === true);
  const hideCompleted = useTodoStore((s) => s.hideCompleted);
  const toggleCollapsed = useTodoStore((s) => s.toggleCollapsed);
  const wantsFocus = useDragStore((s) => s.focusId === todo.id);
  const [showDetails, setShowDetails] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'add' | 'delete'>('view');
  const handleRef = useRef<HTMLButtonElement>(null);

  const children = visibleChildren(map, todo.id, hideCompleted);
  const hasChildren = (map.get(todo.id)?.length ?? 0) > 0;
  const overdue = isOverdue(todo, new Date());
  const railColor = PALETTE[todo.color].hex;

  useEffect(() => {
    if (!wantsFocus) return;
    handleRef.current?.focus();
    useDragStore.getState().requestFocus(null);
  }, [wantsFocus]);

  useEffect(
    () => () => {
      if (useDragStore.getState().focusId === todo.id) useDragStore.getState().requestFocus(null);
    },
    [todo.id],
  );

  const onHandleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!e.altKey) return;
    const key = moveKeyFromArrow(e.key);
    if (key === null) return;
    e.preventDefault();
    const currentMap = buildChildrenMap(Object.values(useTodoStore.getState().todos));
    const target = keyMovePlacement(currentMap, todo.id, key);
    const dragStore = useDragStore.getState();
    if (target === null) {
      dragStore.announce(`Cannot move ${todo.title} ${key}`);
      return;
    }
    const description = describePlacement(useTodoStore.getState().todos, currentMap, todo.id, target);
    const { collapsed: collapsedMap, toggleCollapsed: toggle } = useTodoStore.getState();
    if (target.parentId !== null && collapsedMap[target.parentId] === true) toggle(target.parentId);
    if (!moveTodoTo(todo.id, target)) {
      dragStore.announce(`Cannot move ${todo.title} ${key}`);
      return;
    }
    dragStore.announce(description);
    dragStore.requestFocus(todo.id);
  };

  return (
    <li
      role="treeitem"
      aria-label={todo.title}
      aria-expanded={hasChildren ? !collapsed : undefined}
      data-overdue={overdue ? 'true' : undefined}
      data-details={showDetails ? 'true' : undefined}
      data-completed={todo.completed ? 'true' : undefined}
      data-todo-id={todo.id}
      className={styles.item}
      style={{ '--item-color': railColor } as CSSProperties}
    >
      <div className={styles.row}>
        <button
          type="button"
          ref={handleRef}
          className={styles.handle}
          aria-label={`Move ${todo.title}`}
          aria-describedby={tree.hintId}
          onKeyDown={onHandleKeyDown}
          onPointerDown={(e) => tree.onHandlePointerDown(todo.id, e)}
        >
          <GripIcon />
        </button>
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
            <TodoItem key={c.id} todo={c} map={map} depth={depth + 1} tree={tree} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
