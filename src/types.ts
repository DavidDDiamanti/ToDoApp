import type { ColorName } from './lib/colors';

export interface Todo {
  id: string;
  user_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  due_date: string | null;
  color: ColorName;
  completed: boolean;
  sort_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A partial row update. `id` and `updated_at` are always present. */
export type Patch = Pick<Todo, 'id' | 'updated_at'> & Partial<Omit<Todo, 'id' | 'updated_at'>>;
