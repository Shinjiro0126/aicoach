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
    welcomeMessage: `はじめまして、コーチのホトリです。「${req.goalTitle}」への道は、私が先に歩いてきました。${req.durationMonths ?? 3}ヶ月の道のり、最初の1週間は小さく続けることだけ考えれば十分です。`,
  };
}

const ENCOURAGE = [
  '今日の一歩、確かに見届けました。私の経験では、この小さな積み重ねが最後に効きます。明日も同じ時間に始めましょう。',
  '着実な前進です。ここまで続く人は多くありません。この歩幅を保ちましょう。',
  '完璧である必要はありません。続いていること自体が何よりの成果です。明日は5分だけでも十分です。',
];

const REFLECTION = [
  '今日を振り返りましょう。一番うまくいったことは何でしたか?',
  'できなかった日も道のうちです。私の経験では、翌日の行動を軽くすると必ず再開できます。明日は少しだけ小さくしてみましょう。',
];

export function mockCoach(req: CoachRequest): CoachResponse {
  const pool = req.context.mode === 'reflection' ? REFLECTION : ENCOURAGE;
  const index = req.messages.length % pool.length;
  return { reply: pool[index] };
}

/** オフライン時に画面へ出す定型文 */
export const OFFLINE_FALLBACK_MESSAGE =
  'いまはオフラインのようです。記録はこの端末の中にしっかり残っています。また後で続きを話しましょう。';
