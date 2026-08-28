import type { ReplanStats } from './ai/types';
import { addDaysKey } from './dates';
import type { JourneyDay } from './insight-stats';

/**
 * 週次AIリプラン(/v1/replan)の純関数群。
 * 週の窓は progress.ts / insight-stats.ts と同じ「目標開始日起点の7日区切り」を共有する。
 *
 * プライバシー上の要:
 * prevActions に載せてよいのはAI生成系(daily_actions)の行動文言のみ。
 * ユーザーが自分で追加したcustomタスクの文言・会話・ヒアリング回答は絶対に含めない。
 */

/** 週番号 weekNo(1-based)の日付範囲(初日〜7日目、両端含む) */
export function weekDateRange(startKey: string, weekNo: number): { fromKey: string; toKey: string } {
  const base = (Math.max(1, weekNo) - 1) * 7;
  return { fromKey: addDaysKey(startKey, base), toKey: addDaysKey(startKey, base + 6) };
}

/**
 * 1週1回ガード: 次週分の weeklyPlans が既にあればリプランしない。
 * existingWeekNos には getWeeklyPlans の weekNo 一覧を渡す
 */
export function shouldReplanNextWeek(existingWeekNos: readonly number[], nextWeekNo: number): boolean {
  return !existingWeekNos.includes(nextWeekNo);
}

/**
 * prevActions の組み立て。範囲内の行動文言を日付昇順で最大7件返す。
 * 想定入力は daily_actions の行(AI生成系)だが、誤って daily_tasks の行が渡っても
 * ユーザー追加の custom タスク文言がサーバーへ流れないよう、kind='custom' は防御的に除外する
 */
export function collectPrevActions(
  rows: readonly { date: string; description: string; kind?: string }[],
  range: { fromKey: string; toKey: string },
): string[] {
  return rows
    .filter(
      (r) =>
        r.kind !== 'custom' &&
        r.date >= range.fromKey &&
        r.date <= range.toKey &&
        r.description.trim().length > 0,
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 7)
    .map((r) => r.description);
}

/**
 * 前週の実績統計。days には旗の日の週7日分の JourneyDay
 * (coldStartJourneyDays: セレモニーの週まとめと同じ窓)を渡す
 */
export function buildReplanStats(days: readonly JourneyDay[], streakCurrent: number): ReplanStats {
  return {
    walkedDays: days.filter((d) => d.state === 'walked').length,
    reportedDays: days.filter((d) => d.state === 'reported').length,
    graceDays: days.filter((d) => d.state === 'grace').length,
    streakCurrent,
  };
}

export type ReplanAction = { dayOffset: number; description: string };

/**
 * AI応答の dayOffset を次週の窓に正規化する。
 * - 空文言は捨てる
 * - dayOffset 昇順に並べ、次週初日からの連番((nextWeekNo-1)*7 〜 +6)へ振り直す
 *   (AIが 0〜6 で返しても、正しい絶対オフセットで返しても同じ結果になる)
 * - 7件を超える分は捨てる
 */
export function normalizeReplanActions(
  nextWeekNo: number,
  actions: readonly ReplanAction[],
): ReplanAction[] {
  const base = (Math.max(1, nextWeekNo) - 1) * 7;
  return [...actions]
    .filter((a) => typeof a.description === 'string' && a.description.trim().length > 0)
    .sort((a, b) => a.dayOffset - b.dayOffset)
    .slice(0, 7)
    .map((a, i) => ({ dayOffset: base + i, description: a.description.trim() }));
}

/** 正規化済みの行動を日付キー付きに変換する(insertDailyActions / upsert 系の入力形) */
export function replanActionsToDates(
  startKey: string,
  actions: readonly ReplanAction[],
): { date: string; description: string }[] {
  return actions.map((a) => ({ date: addDaysKey(startKey, a.dayOffset), description: a.description }));
}
