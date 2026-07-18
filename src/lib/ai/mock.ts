import { clampWeeks, monthsToWeeks, weeksLabel } from '@/lib/roadmap';
import type {
  CoachRequest,
  CoachResponse,
  PlanRequest,
  PlanResponse,
  SuggestRequest,
  SuggestResponse,
} from './types';

/**
 * プロキシ未設定(EXPO_PUBLIC_COACH_API_URL なし)時の開発用モック。
 * オフライン時のフォールバック応答にも使う。
 */

export function mockPlan(req: PlanRequest): PlanResponse {
  const weeks = req.durationWeeks ?? monthsToWeeks(req.durationMonths ?? 3);
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
    welcomeMessage: `はじめまして、コーチのホトリです。「${req.goalTitle}」への道は、私が先に歩いてきました。${weeksLabel(weeks)}の道のり、最初の1週間は小さく続けることだけ考えれば十分です。`,
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

/** カテゴリ別の基準週数(習慣系は3ヶ月相当、積み上げ系は6ヶ月相当) */
const SUGGEST_BASE_WEEKS: Record<string, number> = {
  health: 13,
  training: 13,
  career: 26,
  learning: 26,
  money: 26,
  other: 13,
};

/**
 * 期間おすすめのモック(API未設定時のフォールバック)。
 * カテゴリの基準週数を、ヒアリング回答の内容でざっくり補正するヒューリスティック。
 */
export function mockSuggest(req: SuggestRequest): SuggestResponse {
  let weeks = SUGGEST_BASE_WEEKS[req.category ?? 'other'] ?? 13;
  const answers = (req.hearingAnswers ?? []).map((p) => p.answer).join(' ');
  // ゼロから・初挑戦なら長めに、すでに習慣がある人は短めに補正する
  if (/(ほとんど|まったく|まだ何も|初めて|初学者)/.test(answers)) weeks += 4;
  if (/(ほぼ毎日|続いた経験|習慣になっている|今も少し続けている)/.test(answers)) weeks -= 4;
  weeks = clampWeeks(weeks);
  return {
    weeks,
    reason: `私の経験では、この目標は${weeksLabel(weeks)}かけるのが現実的です。急ぐより、続く速さを選びましょう。`,
  };
}

/** オフライン時に画面へ出す定型文 */
export const OFFLINE_FALLBACK_MESSAGE =
  'いまはオフラインのようです。記録はこの端末の中にしっかり残っています。また後で続きを話しましょう。';
