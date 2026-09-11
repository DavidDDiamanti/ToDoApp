import { useCallback, useId, useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { buildChildrenMap, type ChildrenMap } from '../domain/tree';
import { useDragStore } from '../dnd/dragStore';
import { useTodoStore } from '../store/todoStore';
import type { Todo } from '../types';
import { TodoItem } from './TodoItem';
import styles from './TodoTree.module.css';

export interface TreeContext {
  hintId: string;
  onHandlePointerDown(id: string, e: ReactPointerEvent<HTMLElement>): void;
}

export function visibleChildren(map: ChildrenMap, parentId: string | null, hideCompleted: boolean): Todo[] {
  const bucket = map.get(parentId) ?? [];
  return hideCompleted ? bucket.filter((t) => !t.completed) : bucket;
}

export function TodoTree() {
  const todos = useTodoStore((s) => s.todos);
  const hideCompleted = useTodoStore((s) => s.hideCompleted);
  const announcement = useDragStore((s) => s.announcement);
  const map = useMemo(() => buildChildrenMap(Object.values(todos)), [todos]);
  const roots = visibleChildren(map, null, hideCompleted);
  const hintId = useId();

  // Task 8 replaces this with the real pointer drag hook; for now the handle's
  // pointer down is a no-op stub.
  const onHandlePointerDown = useCallback((_id: string, _e: ReactPointerEvent<HTMLElement>) => {}, []);
  const tree = useMemo<TreeContext>(() => ({ hintId, onHandlePointerDown }), [hintId, onHandlePointerDown]);

  return (
    <>
      <p id={hintId} className={styles.srOnly}>Press Alt with an arrow key to move this item</p>
      <div role="status" aria-live="polite" className={styles.srOnly} key={announcement.seq}>{announcement.text}</div>
      {roots.length === 0 ? (
        <p className={styles.empty}>Nothing to do yet. Add your first item.</p>
      ) : (
        <ul role="tree" className={styles.tree} aria-label="Todo items">
          {roots.map((t) => (
            <TodoItem key={t.id} todo={t} map={map} depth={0} tree={tree} />
          ))}
        </ul>
      )}
    </>
  );
}
