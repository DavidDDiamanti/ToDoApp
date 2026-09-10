import { useMemo } from 'react';
import { buildChildrenMap, type ChildrenMap } from '../domain/tree';
import { useTodoStore } from '../store/todoStore';
import type { Todo } from '../types';
import { TodoItem } from './TodoItem';
import styles from './TodoTree.module.css';

export function visibleChildren(map: ChildrenMap, parentId: string | null, hideCompleted: boolean): Todo[] {
  const bucket = map.get(parentId) ?? [];
  return hideCompleted ? bucket.filter((t) => !t.completed) : bucket;
}

export function TodoTree() {
  const todos = useTodoStore((s) => s.todos);
  const hideCompleted = useTodoStore((s) => s.hideCompleted);
  const map = useMemo(() => buildChildrenMap(Object.values(todos)), [todos]);
  const roots = visibleChildren(map, null, hideCompleted);

  return roots.length === 0 ? (
    <p className={styles.empty}>Nothing to do yet. Add your first item.</p>
  ) : (
    <ul role="tree" className={styles.tree} aria-label="Todo items">
      {roots.map((t) => (
        <TodoItem key={t.id} todo={t} map={map} depth={0} />
      ))}
    </ul>
  );
}
