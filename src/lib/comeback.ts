import { diffDays } from './dates';

/**
 * 「復帰の日」の判定と復帰の手紙(決定的テンプレート)の純関数群。
 *
 * 復帰の日 = 過去に提出があり、直近の提出から2日以上空いた
 * (= streak.ts の1日抜け救済を超えてストリークが途切れた)状態で今日を迎え、
 * 今日はまだ未提出の日。救済で守られた1日抜け(空きがちょうど1日)では出さない。
 * 「2日以上空いた」の数え方は insight-stats.ts の trailingGap(>= 2 で「止まった」)と同じ。
 *
 * 手紙はAI呼び出しなしの決定的テンプレートで端末内完結する(サーバーへは送らない)。
 */

/**
 * 直近の提出から今日までに空いた日数(提出も救済も無い丸1日の数)。
 * 提出が1件も無い場合と今日提出済みの場合は 0。
 * 例: 最終提出 9/19・今日 9/22 → 9/20・9/21 の2日が空き → 2
 */
export function comebackGapDays(reportDateKeys: readonly string[], today: string): number {
  let last: string | null = null;
  for (const key of reportDateKeys) {
    // 今日以降のキーは無視する(今日提出済みは呼び出し側の分岐だが、防御的に「過去の提出」だけ見る)
    if (key < today && (last === null || key > last)) last = key;
  }
  if (last === null || reportDateKeys.includes(today)) return 0;
  return Math.max(0, diffDays(last, today) - 1);
}

/**
 * 今日が「復帰の日」か。
 * - 過去に提出が1件以上ある
 * - 今日はまだ未提出
 * - 直近の提出から2日以上空いた(1日抜けは救済ルールで守られるため対象外)
 */
export function isComebackDay(reportDateKeys: readonly string[], today: string): boolean {
  if (reportDateKeys.includes(today)) return false;
  return comebackGapDays(reportDateKeys, today) >= 2;
}

/**
 * 復帰の手紙(3文以内・責めない・断定調)。
 * 統計値(止まった日数・これまで歩いた日数)だけから決定的に組み立てる。
 * 「おやすみ」は救済で守られた日の専用語なので、復帰文脈では使わない。
 *
 * @param stoppedDays 止まっていた日数(comebackGapDays の戻り値)
 * @param walkedDays これまで歩いた日数(チェック1件以上の提出日数)
 */
export function buildComebackLetter(stoppedDays: number, walkedDays: number): string {
  const s1 = `${stoppedDays}日ぶりに、この道で会えました。`;
  const s2 =
    walkedDays > 0
      ? `これまで歩いた${walkedDays}日は、止まっていた間も消えずにここに残っています。`
      : 'これまであなたが残してきた記録は、止まっていた間も消えずにここに残っています。';
  const s3 = '今日の一歩は、いつもより軽い版で十分です。';
  return `${s1}${s2}${s3}`;
}
