/**
 * 道のりの全体図(全期間マイルストーン)の表示用計算。すべて純関数。
 * 週番号は目標開始日起点の1-based(lib/progress.ts の weekFlagInfo.weekNo と同じ規約)。
 * フェーズの fromWeek / toWeek は両端を含む。
 */

/** 道のりの全体図の1フェーズ */
export type MilestoneRange = { fromWeek: number; toWeek: number; title: string };

export type MilestonePhase = 'done' | 'current' | 'upcoming';

/** weekNo(1-based)がフェーズの範囲(両端を含む)に入っているか */
export function isCurrentMilestone(m: MilestoneRange, weekNo: number): boolean {
  return weekNo >= m.fromWeek && weekNo <= m.toWeek;
}

/** フェーズの表示状態: 経過済み(done)/ 現在(current)/ これから(upcoming) */
export function milestonePhase(m: MilestoneRange, weekNo: number): MilestonePhase {
  if (weekNo > m.toWeek) return 'done';
  if (weekNo < m.fromWeek) return 'upcoming';
  return 'current';
}

/**
 * 現在のフェーズのindex(0-based)。どのフェーズにも入っていない・空配列なら -1。
 * 範囲が重複していても最初に一致したフェーズを現在として扱う
 */
export function currentMilestoneIndex(milestones: readonly MilestoneRange[], weekNo: number): number {
  return milestones.findIndex((m) => isCurrentMilestone(m, weekNo));
}

/** 週範囲の表示ラベル。「第x〜y週」、1週だけのフェーズは「第x週」 */
export function milestoneRangeLabel(m: MilestoneRange): string {
  return m.fromWeek === m.toWeek ? `第${m.fromWeek}週` : `第${m.fromWeek}〜${m.toWeek}週`;
}
