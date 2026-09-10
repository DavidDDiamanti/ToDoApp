import type { Todo } from '../types';

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function isOverdue(todo: Pick<Todo, 'due_date' | 'completed'>, today: string): boolean {
  return todo.due_date !== null && !todo.completed && todo.due_date < today;
}

const dueDateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

export function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dueDateFormatter.format(new Date(y, m - 1, d));
}
