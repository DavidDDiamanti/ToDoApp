import { useCallback, useId, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { buildChildrenMap, type ChildrenMap } from '../domain/tree';
import { describePlacement, type Placement } from '../domain/place';
import { useDragStore } from '../dnd/dragStore';
import type { RectReader } from '../dnd/hitTest';
import { useDragReorder } from '../dnd/useDragReorder';
import { useNow } from '../hooks/useNow';
import { moveTodoTo } from '../store/actions';
import { useTodoStore } from '../store/todoStore';
import type { Todo } from '../types';
import { TodoItem } from './TodoItem';
import styles from './TodoTree.module.css';

export interface TreeContext {
  hintId: string;
  /** Shared clock for time-dependent display; ticks once a minute, so `tree` changes then. */
  now: Date;
  onHandlePointerDown(id: string, e: ReactPointerEvent<HTMLElement>): void;
  /** Starts a drag from the item body: after 6 px of mouse movement, or a 350 ms touch hold. */
  onSurfacePointerDown(id: string, e: ReactPointerEvent<HTMLElement>): void;
}

interface Props {
  /** Injectable geometry reader; jsdom reports zero-size rects. */
  getRect?: RectReader;
}

export function visibleChildren(map: ChildrenMap, parentId: string | null, hideCompleted: boolean): Todo[] {
  const bucket = map.get(parentId) ?? [];
  return hideCompleted ? bucket.filter((t) => !t.completed) : bucket;
}

export function TodoTree({ getRect }: Props) {
  const todos = useTodoStore((s) => s.todos);
  const hideCompleted = useTodoStore((s) => s.hideCompleted);
  const announcement = useDragStore((s) => s.announcement);
  const dragging = useDragStore((s) => s.draggingId !== null);
  const map = useMemo(() => buildChildrenMap(Object.values(todos)), [todos]);
  const roots = visibleChildren(map, null, hideCompleted);
  const hintId = useId();
  const now = useNow();

  const rootRef = useRef<HTMLUListElement>(null);
  const mapRef = useRef(map);
  mapRef.current = map;
  const todosRef = useRef(todos);
  todosRef.current = todos;

  const getMap = useCallback(() => mapRef.current, []);
  const onDrop = useCallback((id: string, target: Placement | null) => {
    const refused = `Cannot move ${todosRef.current[id]?.title ?? ''} here`;
    if (target === null) {
      useDragStore.getState().announce(refused);
      return;
    }
    const description = describePlacement(todosRef.current, mapRef.current, id, target);
    // A collapsed destination would swallow the row, so open it before the move lands.
    const { collapsed, toggleCollapsed } = useTodoStore.getState();
    if (target.parentId !== null && collapsed[target.parentId] === true) toggleCollapsed(target.parentId);
    useDragStore.getState().announce(moveTodoTo(id, target) ? description : refused);
  }, []);
  const { onHandlePointerDown, onSurfacePointerDown } = useDragReorder({ rootRef, getMap, getRect, onDrop });
  const tree = useMemo<TreeContext>(
    () => ({ hintId, now, onHandlePointerDown, onSurfacePointerDown }),
    [hintId, now, onHandlePointerDown, onSurfacePointerDown],
  );

  return (
    <>
      <p id={hintId} className={styles.srOnly}>Press Alt with an arrow key to move this item</p>
      <div role="status" aria-live="polite" className={styles.srOnly}>
        {announcement.seq % 2 === 0 ? announcement.text : `${announcement.text}\u00A0`}
      </div>
      {roots.length === 0 ? (
        <p className={styles.empty}>Nothing to do yet. Add your first item.</p>
      ) : (
        <ul
          role="tree"
          ref={rootRef}
          className={styles.tree}
          aria-label="Todo items"
          data-dragging={dragging ? 'true' : undefined}
        >
          {roots.map((t) => (
            <TodoItem key={t.id} todo={t} map={map} depth={0} tree={tree} />
          ))}
        </ul>
      )}
    </>
  );
}
