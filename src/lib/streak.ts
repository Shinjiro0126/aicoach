import { addDaysKey, diffDays } from './dates';

export type StreakResult = {
  /** 現在の連続日数(今日を含む。今日未達成でも昨日まで続いていれば継続扱い) */
  current: number;
  /** 過去最長の連続日数 */
  best: number;
  /** 現在のストリークで救済(1日スキップ許容)が使われた日 */
  graceUsedOn: string[];
};

/**
 * ストリーク計算。
 *
 * ルール:
 * - 連続して done の日が続く限りカウントする。
 * - 1日だけの抜けは「救済」として許容する。ただし救済同士は7日以上離れている必要がある。
 * - 2日以上連続の抜けはストリークを断ち切る。
 * - 今日がまだ未達成でもストリークは切れない(今日はカウントに含めない)。
 */
export function computeStreak(doneDates: readonly string[], today: string): StreakResult {
  const done = new Set(doneDates);

  const walk = (start: string): { length: number; grace: string[] } => {
    let length = 0;
    const grace: string[] = [];
    let cursor = start;
    for (;;) {
      if (done.has(cursor)) {
        length += 1;
        cursor = addDaysKey(cursor, -1);
        continue;
      }
      // 抜けている日: 救済を検討(その前日はdoneであること = 1日だけの抜け)
      const prev = addDaysKey(cursor, -1);
      const lastGrace = grace[grace.length - 1];
      const graceAvailable = lastGrace === undefined || diffDays(cursor, lastGrace) >= 7;
      if (done.has(prev) && graceAvailable) {
        grace.push(cursor);
        cursor = prev;
        continue;
      }
      break;
    }
    return { length, grace };
  };

  // 現在のストリーク: 今日done なら今日から、未達成なら昨日から数える
  const currentStart = done.has(today) ? today : addDaysKey(today, -1);
  const currentWalk = walk(currentStart);

  // ベスト: 各done日を終端候補としてwalk(その翌日がdoneでない日のみ = ランの終端)
  let best = currentWalk.length;
  for (const key of done) {
    if (done.has(addDaysKey(key, 1))) continue;
    const { length } = walk(key);
    if (length > best) best = length;
  }

  return { current: currentWalk.length, best, graceUsedOn: currentWalk.grace };
}
