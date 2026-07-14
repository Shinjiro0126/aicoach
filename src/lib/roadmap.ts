import { diffDays, toDateKey } from './dates';

/**
 * ロードマップ(ジャーニー表示)用の週計算。
 * すべて純関数。日付は端末ローカルの YYYY-MM-DD キー(dates.ts と同じ規約)。
 */

/** 週次フォーカスは現状4週固定(期間が長くても「最初の4週間」として扱う) */
export const ROADMAP_WEEKS = 4;

/**
 * startKey から見た today の 0-based 週index。
 * 開始日〜6日後が 0、7〜13日後が 1、…。today が開始日より前なら 0。
 */
export function weekIndex(startKey: string, today: string): number {
  const days = diffDays(startKey, today);
  if (days <= 0) return 0;
  return Math.floor(days / 7);
}

/**
 * 表示用の現在週番号(1-based)。totalWeeks を超えたら totalWeeks にクランプする
 * (期間が4週を超えても「第4週のフォーカス」を継続表示するため)。
 */
export function currentWeekNo(startKey: string, today: string, totalWeeks: number = ROADMAP_WEEKS): number {
  const weeks = Math.max(1, totalWeeks);
  return Math.min(weekIndex(startKey, today) + 1, weeks);
}

/** 週番号 weekNo(1-based)が経過済み(現在週より前)かどうか */
export function isWeekDone(startKey: string, today: string, weekNo: number): boolean {
  return weekNo < weekIndex(startKey, today) + 1;
}

/**
 * key の months ヶ月後の日付キー。
 * 加算後の月に同じ日が存在しない場合は月末に丸める(例: 1/31 + 1ヶ月 = 2/28)。
 */
export function addMonthsKey(key: string, months: number): string {
  const [y, m, d] = key.split('-').map(Number);
  // 正午起点でDST等の日跨ぎ誤差を避ける(dates.ts と同じ方針)
  const lastDay = new Date(y, m - 1 + months + 1, 0, 12).getDate();
  return toDateKey(new Date(y, m - 1 + months, Math.min(d, lastDay), 12));
}

/** startKey から targetKey までのおおよその月数(最低1、四捨五入) */
export function durationMonthsBetween(startKey: string, targetKey: string): number {
  const days = diffDays(startKey, targetKey);
  return Math.max(1, Math.round(days / 30.44));
}
