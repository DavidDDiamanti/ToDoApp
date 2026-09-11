import { describe, expect, it } from 'vitest';
import { formatDue, formatDueDate, isOverdue, normalizeTime, nowISO, resolveDueDate, todayISO } from './dates';

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

describe('resolveDueDate', () => {
  it('keeps an explicit date even when a time is given', () => {
    expect(resolveDueDate('2026-09-15', '10:00', new Date(2026, 8, 10, 9, 0))).toBe('2026-09-15');
  });

  it('is null with neither a date nor a time', () => {
    expect(resolveDueDate(null, null, new Date(2026, 8, 10, 9, 0))).toBeNull();
  });

  it('passes an explicit date through when there is no time', () => {
    expect(resolveDueDate('2026-09-15', null, new Date(2026, 8, 10, 9, 0))).toBe('2026-09-15');
  });

  it('resolves a time later today to today', () => {
    expect(resolveDueDate(null, '15:37', new Date(2026, 8, 10, 15, 0))).toBe('2026-09-10');
  });

  it('resolves a time already passed today to tomorrow', () => {
    expect(resolveDueDate(null, '15:37', new Date(2026, 8, 10, 16, 0))).toBe('2026-09-11');
  });

  it('treats the same minute as already passed', () => {
    expect(resolveDueDate(null, '15:37', new Date(2026, 8, 10, 15, 37, 0))).toBe('2026-09-11');
  });

  it('rolls over a month end', () => {
    expect(resolveDueDate(null, '22:00', new Date(2026, 0, 31, 23, 0))).toBe('2026-02-01');
  });
});

describe('isOverdue', () => {
  const now = new Date(2026, 8, 10, 12, 0);

  it('is true when the due date is in the past and the item is not completed', () => {
    expect(isOverdue({ due_date: '2026-09-09', due_time: null, completed: false }, now)).toBe(true);
  });
  it('is false on the due day itself', () => {
    expect(isOverdue({ due_date: '2026-09-10', due_time: null, completed: false }, now)).toBe(false);
  });
  it('is false when completed', () => {
    expect(isOverdue({ due_date: '2026-09-01', due_time: null, completed: true }, now)).toBe(false);
  });
  it('is false without a due date', () => {
    expect(isOverdue({ due_date: null, due_time: null, completed: false }, now)).toBe(false);
  });
  it('is overdue once the due date and time instant has passed', () => {
    expect(isOverdue({ due_date: '2026-09-10', due_time: '11:59', completed: false }, now)).toBe(true);
  });
  it('is not overdue before the due date and time instant', () => {
    expect(isOverdue({ due_date: '2026-09-10', due_time: '12:01', completed: false }, now)).toBe(false);
  });
  it('is not overdue on its due day even late at night when there is no time', () => {
    const lateSameDay = new Date(2026, 8, 10, 23, 59);
    expect(isOverdue({ due_date: '2026-09-10', due_time: null, completed: false }, lateSameDay)).toBe(false);
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

describe('formatDue', () => {
  it('matches formatDueDate when there is no time', () => {
    expect(formatDue('2026-01-05', null, 'en-US')).toBe(formatDueDate('2026-01-05', 'en-US'));
  });

  it('formats date and time together in en-US', () => {
    expect(formatDue('2026-01-05', '15:37', 'en-US').replace(/\s/g, ' ')).toBe('Jan 5, 2026, 3:37 PM');
  });

  it('formats date and time together in de-DE', () => {
    expect(formatDue('2026-01-05', '15:37', 'de-DE')).toBe('05.01.2026, 15:37');
  });
});

describe('normalizeTime', () => {
  it('keeps a well formed HH:MM value', () => {
    expect(normalizeTime('09:30')).toBe('09:30');
  });
  it('trims the seconds off an HH:MM:SS value', () => {
    expect(normalizeTime('09:30:45')).toBe('09:30');
  });
  it('returns null for anything else', () => {
    expect(normalizeTime('')).toBeNull();
    expect(normalizeTime('9:30')).toBeNull();
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('09:60')).toBeNull();
    expect(normalizeTime('half past nine')).toBeNull();
  });
});
