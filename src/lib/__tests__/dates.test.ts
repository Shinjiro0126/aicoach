import { addDaysKey, diffDays, formatJP, monthMeta, toDateKey } from '../dates';

describe('dates', () => {
  it('toDateKey はローカル日付を YYYY-MM-DD にする', () => {
    expect(toDateKey(new Date(2026, 6, 2))).toBe('2026-07-02');
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('addDaysKey は月・年を跨いで加算できる', () => {
    expect(addDaysKey('2026-07-02', 1)).toBe('2026-07-03');
    expect(addDaysKey('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28');
    // うるう年
    expect(addDaysKey('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('深夜0時直後の日付でも正しいキーになる', () => {
    expect(toDateKey(new Date(2026, 6, 2, 0, 0, 1))).toBe('2026-07-02');
    expect(toDateKey(new Date(2026, 6, 2, 23, 59, 59))).toBe('2026-07-02');
  });

  it('diffDays', () => {
    expect(diffDays('2026-07-01', '2026-07-02')).toBe(1);
    expect(diffDays('2026-07-02', '2026-07-01')).toBe(-1);
    expect(diffDays('2026-06-25', '2026-07-02')).toBe(7);
  });

  it('formatJP', () => {
    expect(formatJP('2026-07-02')).toBe('7月2日(木)');
  });

  it('monthMeta', () => {
    const { firstWeekday, daysInMonth } = monthMeta(2026, 7);
    expect(firstWeekday).toBe(3); // 2026-07-01 は水曜
    expect(daysInMonth).toBe(31);
  });
});
