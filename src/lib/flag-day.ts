import { addDaysKey } from './dates';
import type { JourneyDay } from './insight-stats';

/**
 * 旗の日セレモニー(週の締め)の純関数群。
 * 週の窓は insight-stats.ts の週アライン計算(coldStartJourneyDays / weekAlignedJourneyDays)と
 * 同じ週境界(目標開始日起点の7日区切り)を共有する。呼び出し側は
 * coldStartJourneyDays(startKey, reports, graceUsedOn, today) の7日分をそのまま渡すこと。
 */

/**
 * 週のまとめ1行(端末内集計・AI不要)。
 * 歩いた日 / 報告した日 / おやすみ の数を並べ、0件の項目は文から省く。
 * 例: 「この7日で、歩いた日が5日、報告した日が1日、おやすみが1日。できなかった日も、道のうちです。」
 */
export function buildFlagWeekSummary(days: readonly JourneyDay[]): string {
  const walked = days.filter((d) => d.state === 'walked').length;
  const reported = days.filter((d) => d.state === 'reported').length;
  const grace = days.filter((d) => d.state === 'grace').length;

  const parts: string[] = [];
  if (walked > 0) parts.push(`歩いた日が${walked}日`);
  if (reported > 0) parts.push(`報告した日が${reported}日`);
  if (grace > 0) parts.push(`おやすみが${grace}日`);

  // 旗の日は提出直後に開くため実際には1件以上あるが、防御的にフォールバックを持つ
  if (parts.length === 0) {
    return 'この7日の記録はまだありません。次の7日を、いまの歩幅で歩きましょう。';
  }

  // 7日すべて歩いた週だけは「できなかった日」の文を出さない(事実と合わない文を見せない)
  const closing =
    walked === days.length
      ? '7日すべてを、自分の足で歩き切りました。'
      : 'できなかった日も、道のうちです。';
  return `この7日で、${parts.join('、')}。${closing}`;
}

/**
 * 次週プレビュー(A-3)。次週フォーカスがある間だけ「道を整えた」と予告し、
 * 無い(第4週の旗以降)場合は実現できない約束をしない文に差し替える
 */
export function buildNextWeekPreview(weekNo: number, hasNextFocus: boolean): string {
  return hasNextFocus
    ? `第${weekNo + 1}週の道を整えておきました。明日の朝、最初の石で待っています。`
    : '明日も、この道の続きで待っています。';
}

/**
 * 旗の日の曜日(目標開始日から+6日した日の曜日)。
 * expo-notifications の WEEKLY トリガー用に 1=日曜〜7=土曜 で返す
 */
export function flagDayNotificationWeekday(startKey: string): number {
  const flagKey = addDaysKey(startKey, 6);
  const [y, m, d] = flagKey.split('-').map(Number);
  // 正午起点でDST等の日跨ぎ誤差を避ける(dates.ts と同じ方針)
  return new Date(y, m - 1, d, 12).getDay() + 1;
}

/**
 * 週初日(旗の日の翌日)の曜日。開始日+7日は開始日と同じ曜日になる。
 * 手帳更新通知(C-2)の WEEKLY トリガー用に 1=日曜〜7=土曜 で返す
 */
export function weekStartNotificationWeekday(startKey: string): number {
  const [y, m, d] = startKey.split('-').map(Number);
  // 正午起点でDST等の日跨ぎ誤差を避ける(dates.ts と同じ方針)
  return new Date(y, m - 1, d, 12).getDay() + 1;
}
