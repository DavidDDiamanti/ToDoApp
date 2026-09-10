import { describe, expect, it } from 'vitest';
import { formatDueDate, isOverdue, nowISO, todayISO } from './dates';

describe('todayISO', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('nowISO', () => {
  it('returns an ISO timestamp', () => {
    expect(Date.parse(nowISO())).not.toBeNaN();
  });
});

describe('isOverdue', () => {
  const today = '2026-09-10';
  it('is true when the due date is in the past and the item is not completed', () => {
    expect(isOverdue({ due_date: '2026-09-09', completed: false }, today)).toBe(true);
  });
  it('is false on the due day itself', () => {
    expect(isOverdue({ due_date: '2026-09-10', completed: false }, today)).toBe(false);
  });
  it('is false when completed', () => {
    expect(isOverdue({ due_date: '2026-09-01', completed: true }, today)).toBe(false);
  });
  it('is false without a due date', () => {
    expect(isOverdue({ due_date: null, completed: false }, today)).toBe(false);
  });
});

describe('formatDueDate', () => {
  it('formats an ISO date using a locale-aware format, not the raw string', () => {
    expect(formatDueDate('2026-01-05', 'en-US')).toBe('Jan 5, 2026');
  });

  it('formats using the given locale', () => {
    expect(formatDueDate('2026-01-05', 'de-DE')).toBe('05.01.2026');
  });
});
