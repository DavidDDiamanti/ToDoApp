import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { formatDue, isOverdue } from '../lib/dates';
import { PALETTE } from '../lib/colors';
import { buildChildrenMap, type ChildrenMap } from '../domain/tree';
import { describePlacement, keyMovePlacement, type MoveKey } from '../domain/place';
import { useDragStore } from '../dnd/dragStore';
import { addTodo, editTodo, moveTodoTo, removeTodo, toggleTodo } from '../store/actions';
import { useTodoStore } from '../store/todoStore';
import { editorKindFor, useUiStore } from '../store/uiStore';
import type { Todo } from '../types';
import { ChevronIcon, GripIcon, PencilIcon, PlusIcon, TrashIcon } from './icons';
import { TIP } from './tips';
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
  const isDragging = useDragStore((s) => s.draggingId === todo.id);
  const dropZone = useDragStore((s) => (s.indicator?.targetId === todo.id ? s.indicator.zone : null));
  const isActive = useUiStore((s) => s.activeItemId === todo.id);
  const editorKind = useUiStore((s) => editorKindFor(s.openEditor, todo.id));
  const [hovered, setHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const handleRef = useRef<HTMLButtonElement>(null);

  const children = visibleChildren(map, todo.id, hideCompleted);
  const hasChildren = (map.get(todo.id)?.length ?? 0) > 0;
  const overdue = isOverdue(todo, tree.now);
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

  useEffect(
    () => () => {
      if (useUiStore.getState().activeItemId === todo.id) useUiStore.getState().setActive(null);
    },
    [todo.id],
  );

  useEffect(
    () => () => {
      if (editorKindFor(useUiStore.getState().openEditor, todo.id) !== null) useUiStore.getState().closeEditor();
    },
    [todo.id],
  );

  const onHandleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!e.altKey) return;
    const key = moveKeyFromArrow(e.key);
    if (key === null) return;
    e.preventDefault();
    if (editorKind !== null) {
      useDragStore.getState().announce(`Finish editing ${todo.title} before moving it`);
      return;
    }
    const currentMap = buildChildrenMap(Object.values(useTodoStore.getState().todos));
    const hidden = useTodoStore.getState().hideCompleted;
    const isVisible = hidden ? (t: Todo) => !t.completed : () => true;
    const target = keyMovePlacement(currentMap, todo.id, key, isVisible);
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

  // The whole item body is a drag surface. Controls keep their own gestures: the checkbox,
  // the chevron, the action buttons, the grip (it has its own handler) and anything inside an
  // editor or a dialog. Only the title button, which opens details, doubles as a drag surface.
  const onSurfacePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (editorKind !== null) return;
    const t = e.target;
    if (t instanceof Element && t.closest('input, select, textarea, a, [data-editor-root], [role="dialog"]') !== null) return;
    const b = t instanceof Element ? t.closest('button') : null;
    if (b !== null && !b.hasAttribute('data-drag-surface')) return;
    tree.onSurfacePointerDown(todo.id, e);
  };

  return (
    <li
      role="treeitem"
      aria-label={todo.title}
      aria-expanded={hasChildren ? !collapsed : undefined}
      data-overdue={overdue ? 'true' : undefined}
      data-active={isActive ? 'true' : undefined}
      data-hovered={hovered ? 'true' : undefined}
      data-completed={todo.completed ? 'true' : undefined}
      data-dragging={isDragging ? 'true' : undefined}
      data-drop={dropZone ?? undefined}
      className={styles.item}
      style={{ '--item-color': railColor, '--depth': depth } as CSSProperties}
    >
      <div
        className={styles.body}
        data-item-body
        onPointerEnter={(e) => {
          // Touch has no hover; a drag in progress must not flash buttons on rows it crosses.
          if (e.pointerType === 'touch' || useDragStore.getState().draggingId !== null) return;
          setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
      >
        <div className={styles.row} data-todo-id={todo.id} onPointerDown={onSurfacePointerDown}>
          <button
            type="button"
            ref={handleRef}
            className={styles.handle}
            aria-label={`Move ${todo.title}`}
            title={TIP.move}
            aria-describedby={tree.hintId}
            data-drag-handle
            onKeyDown={onHandleKeyDown}
            onPointerDown={(e) => {
              // The row cannot move while its own editor is open: the editor would be torn
              // out of the tree mid-gesture. Press ignored, and the reason is announced.
              if (editorKind !== null) {
                useDragStore.getState().announce(`Finish editing ${todo.title} before moving it`);
                return;
              }
              tree.onHandlePointerDown(todo.id, e);
            }}
          >
            <GripIcon />
          </button>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={todo.completed}
            aria-label={`Mark ${todo.title} ${todo.completed ? 'incomplete' : 'complete'}`}
            title={todo.completed ? TIP.incomplete : TIP.complete}
            onChange={() => toggleTodo(todo.id)}
          />

          <button
            type="button"
            className={styles.titleButton}
            data-drag-surface
            aria-label={`${showDetails ? 'Hide' : 'Show'} details for ${todo.title}`}
            title={showDetails ? TIP.hideDetails : TIP.showDetails}
            aria-expanded={showDetails}
            onClick={() => {
              setShowDetails((v) => !v);
              useUiStore.getState().setActive(todo.id);
            }}
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

          {hasChildren ? (
            <button
              type="button"
              className={`${styles.iconButton} ${collapsed ? '' : styles.open}`}
              aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${todo.title}`}
              title={collapsed ? TIP.expand : TIP.collapse}
              onClick={() => toggleCollapsed(todo.id)}
            >
              <ChevronIcon />
            </button>
          ) : null}

          {isActive || hovered ? (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Edit ${todo.title}`}
                title={TIP.edit}
                data-editor-toggle
                aria-expanded={editorKind === 'edit'}
                onClick={() => useUiStore.getState().requestOpen({ kind: 'edit', id: todo.id })}
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Add item under ${todo.title}`}
                title={TIP.add}
                data-editor-toggle
                aria-expanded={editorKind === 'add'}
                onClick={() => {
                  useUiStore.getState().requestOpen({ kind: 'add', id: todo.id });
                  // requestOpen is a request: a discard prompt or a dirty editor can refuse it.
                  // Only reveal the new child's editor when there is one to reveal.
                  const opened = editorKindFor(useUiStore.getState().openEditor, todo.id) === 'add';
                  if (opened && collapsed) toggleCollapsed(todo.id);
                }}
              >
                <PlusIcon />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Delete ${todo.title}`}
                title={TIP.delete}
                onClick={() => {
                  // A discard prompt is already up; do not stack a delete dialog on top of it.
                  if (useUiStore.getState().pendingClose !== null) return;
                  setConfirmingDelete(true);
                }}
              >
                <TrashIcon />
              </button>
            </div>
          ) : null}
        </div>

        {editorKind === 'edit' ? (
          <TodoEditor
            initial={{ title: todo.title, description: todo.description, due_date: todo.due_date, due_time: todo.due_time, color: todo.color }}
            heading={`Edit ${todo.title}`}
            submitLabel="Save changes"
            onSave={(v) => editTodo(todo.id, v)}
          />
        ) : null}
        {editorKind === 'add' ? (
          <TodoEditor
            initial={{ title: '', description: '', due_date: null, due_time: null, color: todo.color }}
            heading={`New item under ${todo.title}`}
            submitLabel="Add item"
            onSave={(v) => addTodo(v, todo.id)}
          />
        ) : null}
        {confirmingDelete ? (
          <DeleteDialog
            title={todo.title}
            hasChildren={hasChildren}
            onDeleteAll={() => { removeTodo(todo.id, 'subtree'); setConfirmingDelete(false); }}
            onPromote={() => { removeTodo(todo.id, 'promote'); setConfirmingDelete(false); }}
            onCancel={() => setConfirmingDelete(false)}
          />
        ) : null}

        {showDetails ? (
          <div className={styles.details} onPointerDown={onSurfacePointerDown}>
            {todo.description.length > 0 ? <p className={styles.description}>{todo.description}</p> : <p className={styles.noDescription}>No description yet.</p>}
          </div>
        ) : null}
      </div>

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
