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

export function resolveDueDate(date: string | null, time: string | null, now: Date): string | null {
  if (time === null) return date;
  if (date !== null) return date;
  const [hh, mm] = time.split(':').map(Number);
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
  if (candidate.getTime() > now.getTime()) return todayISO(now);
  return todayISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}

export function isOverdue(todo: Pick<Todo, 'due_date' | 'due_time' | 'completed'>, now: Date): boolean {
  if (todo.due_date === null || todo.completed) return false;
  if (todo.due_time === null) return todo.due_date < todayISO(now);
  const [y, m, d] = todo.due_date.split('-').map(Number);
  const [hh, mm] = todo.due_time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime() < now.getTime();
}

export function formatDueDate(iso: string, locale?: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(y, m - 1, d));
}

export function formatDue(date: string, time: string | null, locale?: string): string {
  if (time === null) return formatDueDate(date, locale);
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(y, m - 1, d, hh, mm));
}
