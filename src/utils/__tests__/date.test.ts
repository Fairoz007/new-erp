// Business dates are local calendar dates. These run in Asia/Muscat (UTC+4), where the old
// toISOString().slice(0, 10) gave yesterday's date between 00:00 and 04:00.
import { describe, it, expect, beforeAll } from 'vitest';
import { todayYmd, addDaysYmd, currentMonthYm, toYmd, parseLocalDate, formatDate, isDateOverdue } from '../date';

beforeAll(() => { (globalThis as any).process.env.TZ = 'Asia/Muscat'; });

describe('local dates', () => {
  it('today just after midnight in Muscat is the local day, not the UTC day', () => {
    const lateNight = new Date(2026, 10, 13, 1, 30);           // 13 Nov 01:30 local = 12 Nov 21:30 UTC
    expect(lateNight.toISOString().slice(0, 10)).toBe('2026-11-12');
    expect(todayYmd(lateNight)).toBe('2026-11-13');
    expect(currentMonthYm(new Date(2026, 11, 1, 0, 15))).toBe('2026-12');
  });
  it('adds days across month and year ends', () => {
    expect(addDaysYmd(1, '2026-12-31')).toBe('2027-01-01');
    expect(addDaysYmd(-1, '2024-03-01')).toBe('2024-02-29');
    expect(addDaysYmd(30, '2026-01-31')).toBe('2026-03-02');
    expect(addDaysYmd(0, new Date(2026, 4, 5, 23, 59))).toBe('2026-05-05');
  });
  it('parses YYYY-MM-DD as a local date', () => {
    const d = parseLocalDate('2026-11-13');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 13, 0]);
    expect(toYmd(d)).toBe('2026-11-13');
    expect(formatDate('2026-11-13')).toBe('13 Nov 2026');
    expect(formatDate(null)).toBe('N/A');
  });
  it('overdue means before today', () => {
    expect(isDateOverdue(addDaysYmd(-1))).toBe(true);
    expect(isDateOverdue(todayYmd())).toBe(false);
    expect(isDateOverdue(addDaysYmd(1))).toBe(false);
  });
});
