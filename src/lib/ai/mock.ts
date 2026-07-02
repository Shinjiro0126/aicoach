import type { CoachRequest, CoachResponse, PlanRequest, PlanResponse } from './types';

/**
 * プロキシ未設定(EXPO_PUBLIC_COACH_API_URL なし)時の開発用モック。
 * オフライン時のフォールバック応答にも使う。
 */

export function mockPlan(req: PlanRequest): PlanResponse {
  return {
    weeklyFocus: [
      'まずは小さく始める習慣づくり',
      'リズムを安定させる',
      '少しだけ負荷を上げる',
      '振り返って仕組みを整える',
    ],
    dailyActions: Array.from({ length: 7 }, (_, i) => ({
      dayOffset: i,
      description:
        i === 0
          ? `「${req.goalTitle}」に向けて、今日は5分だけ着手する`
          : `「${req.goalTitle}」のための行動を10分続ける`,
    })),
    welcomeMessage: `「${req.goalTitle}」、一緒に始めましょう。最初の1週間は小さく続けることだけ考えれば大丈夫です。`,
  };
}

const ENCOURAGE = [
  '今日も一歩前進ですね。この調子でいきましょう。',
  '小さな積み重ねが一番強いです。よくやりました。',
  '完璧じゃなくていいんです。続いていることが何よりの成果です。',
];

const REFLECTION = [
  '今日を振り返ってみて、一番うまくいったことは何でしたか?',
  'できなかった日があっても大丈夫。明日の行動を少しだけ軽くしてみましょうか。',
];

export function mockCoach(req: CoachRequest): CoachResponse {
  const pool = req.context.mode === 'reflection' ? REFLECTION : ENCOURAGE;
  const index = req.messages.length % pool.length;
  return { reply: pool[index] };
}

/** オフライン時に画面へ出す定型文 */
export const OFFLINE_FALLBACK_MESSAGE =
  'いまオフラインのようです。記録はちゃんと保存されているので、また後で話しましょう。';
