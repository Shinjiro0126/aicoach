/**
 * 日付キー(端末ローカルタイムゾーンの YYYY-MM-DD)を扱うユーティリティ。
 * DBの date カラムはすべてこのキー形式で保存する。
 */

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

/** 日付キーに日数を加算した新しいキーを返す(負数可) */
export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  // 正午起点にすることでDST等による日跨ぎ誤差を避ける
  const date = new Date(y, m - 1, d, 12, 0, 0);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** key2 - key1 の日数差 */
export function diffDays(key1: string, key2: string): number {
  const toUTC = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(key2) - toUTC(key1)) / 86_400_000);
}

/** 「7月2日(水)」形式 */
export function formatJP(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  const week = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  return `${m}月${d}日(${week})`;
}

/** その月のカレンダー表示用: 月初の曜日(0=日)と日数 */
export function monthMeta(year: number, month1: number): { firstWeekday: number; daysInMonth: number } {
  const first = new Date(year, month1 - 1, 1);
  const last = new Date(year, month1, 0);
  return { firstWeekday: first.getDay(), daysInMonth: last.getDate() };
}
