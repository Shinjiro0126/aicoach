/**
 * 来週の歩幅宣言(旗の日セレモニーの3択)の純関数群。
 * 宣言はストア(stores/app.ts)に { goalId, pace, forWeekNo } で永続化され、
 * 宣言した目標(goalId)の対象週(forWeekNo)にだけ効く。他の週・他の目標には漏らさない。
 */

export type NextWeekPace = 'keep' | 'lighter' | 'wider';

export type PaceDeclaration = {
  /**
   * 宣言した目標のID。目標リセット(アーカイブ→新目標)後に旧目標の宣言が
   * 新目標の同じ週番号へ漏れないよう、効かせる判定で必ず照合する
   * (観察手帳キャッシュ InsightCacheEntry が goalId で照合するのと同じ方針)
   */
  goalId: string;
  pace: NextWeekPace;
  /** 宣言が効く週番号(1-based・クランプなしの実週番号)。翌週のみ */
  forWeekNo: number;
};

/** 「少し軽くする」を選んだ週の main タスクへの接尾文言 */
export const LIGHTER_SUFFIX = '(今週は5分版で十分です)';
/** 「少し広げる」を選んだ週の main タスクへの接尾文言 */
export const WIDER_SUFFIX = '(今週は、もう5分だけ足しましょう)';

/**
 * その週に効く歩幅。宣言が無い・目標が違う・対象週が違う場合は 'keep'。
 * goalId には現在のアクティブ目標のID、weekNo にはクランプなしの実週番号(weekIndex + 1)を渡すこと
 */
export function effectivePace(
  declaration: PaceDeclaration | null | undefined,
  goalId: string,
  weekNo: number,
): NextWeekPace {
  return declaration && declaration.goalId === goalId && declaration.forWeekNo === weekNo
    ? declaration.pace
    : 'keep';
}

/**
 * main タスクの説明文への歩幅反映。元の行動文を壊さず接尾で調整する。
 * 既に付いている歩幅接尾は必ず剥がしてから付け直すため、
 * 前週の文言が daily_actions 経由で引き継がれても重複付与・漏れ残りが起きない
 */
export function applyPaceToMain(title: string, pace: NextWeekPace): string {
  let base = title;
  for (const suffix of [LIGHTER_SUFFIX, WIDER_SUFFIX]) {
    if (base.endsWith(suffix)) base = base.slice(0, base.length - suffix.length);
  }
  if (pace === 'lighter') return `${base}${LIGHTER_SUFFIX}`;
  if (pace === 'wider') return `${base}${WIDER_SUFFIX}`;
  return base;
}
