import { addDaysKey, diffDays, toDateKey } from './dates';

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

// ===== 達成期間(週数)の換算・整形 =====
// オンボーディングv2から期間は「週数」で一元管理する(プリセットは月→週に換算)

/** カスタム期間の下限(2週間) */
export const MIN_DURATION_WEEKS = 2;
/** カスタム期間の上限(2年 = 104週) */
export const MAX_DURATION_WEEKS = 104;

/** 月数 → 週数の換算(1年=52週基準で四捨五入。1ヶ月=4週、3ヶ月=13週、6ヶ月=26週、12ヶ月=52週) */
export function monthsToWeeks(months: number): number {
  return Math.round((months * 52) / 12);
}

/** 週数を 2〜104週 の範囲に丸める(AIおすすめ・ステッパーの安全弁) */
export function clampWeeks(weeks: number): number {
  if (!Number.isFinite(weeks)) return monthsToWeeks(3);
  return Math.min(MAX_DURATION_WEEKS, Math.max(MIN_DURATION_WEEKS, Math.round(weeks)));
}

/**
 * 週数の表示ラベル。プリセット(1/3/6ヶ月/1年)に一致すればその表記、
 * それ以外は「N週間」(カスタム指定)。
 */
export function weeksLabel(weeks: number): string {
  if (weeks === monthsToWeeks(12)) return '1年';
  for (const months of [1, 3, 6]) {
    if (weeks === monthsToWeeks(months)) return `${months}ヶ月`;
  }
  return `${weeks}週間`;
}

/** key の weeks 週間後の日付キー(目標期日の計算用) */
export function addWeeksKey(key: string, weeks: number): string {
  return addDaysKey(key, weeks * 7);
}
