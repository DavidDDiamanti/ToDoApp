import type { Todo } from '../types';

let counter = 0;

/** Build a todo for tests. `created_at` increases with each call so default order is creation order. */
export function mk(id: string, parent_id: string | null = null, overrides: Partial<Todo> = {}): Todo {
  counter += 1;
  const t = new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString();
  return {
    id,
    user_id: 'local',
    parent_id,
    title: id,
    description: '',
    due_date: null,
    due_time: null,
    color: 'slate',
    completed: false,
    sort_order: 0,
    deleted_at: null,
    created_at: t,
    updated_at: t,
    ...overrides,
  };
}

export function byId(...todos: Todo[]): Record<string, Todo> {
  const out: Record<string, Todo> = {};
  for (const t of todos) out[t.id] = t;
  return out;
}
