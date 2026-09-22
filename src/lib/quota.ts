/**
 * AI対話回数制限(1日N回)。
 * 無料プランは Config.freeDailyMessageLimit、プレミアムは Config.premiumDailyMessageLimit を
 * 上限として呼び出し側(ストア)が limit を選ぶ。プレミアムも有限のソフトリミットを持ち、
 * 使い切ると無料枠と同じく翌日まで送信不可になる(UIに残数カウンタは出さない)。
 * 状態はZustandストアに永続化され、日付が変わるとリセットされる。
 */

export type QuotaState = {
  /** 使用日の日付キー(YYYY-MM-DD) */
  date: string;
  /** その日の使用回数 */
  used: number;
};

export function remainingQuota(state: QuotaState, today: string, limit: number): number {
  const used = state.date === today ? state.used : 0;
  return Math.max(0, limit - used);
}

export function canSendMessage(state: QuotaState, today: string, limit: number): boolean {
  return remainingQuota(state, today, limit) > 0;
}

/** 1回消費した後の新しい状態を返す(日付が変わっていればリセットして1回目) */
export function consumeQuota(state: QuotaState, today: string): QuotaState {
  if (state.date === today) return { date: today, used: state.used + 1 };
  return { date: today, used: 1 };
}
