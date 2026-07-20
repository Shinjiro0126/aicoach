import { clampWeeks, weeksLabel } from '@/lib/roadmap';
import type { HearingPair, SuggestResponse } from './types';

/**
 * 期間おすすめのフォールバック見立て(純関数)。
 * API失敗・タイムアウト時やモック(mock.ts)から使う、カテゴリ別の決定的な週数+理由文。
 * どんな日でも「ホトリのおすすめ」を必ず届けるための共通ロジック。
 */

/** 見立てAPIの待ち時間上限(これを超えたらフォールバック見立てに切り替える) */
export const SUGGEST_TIMEOUT_MS = 6_000;

/** カテゴリ別の基準週数(習慣系は3ヶ月相当、積み上げ系は6ヶ月相当) */
export const FALLBACK_WEEKS: Record<string, number> = {
  health: 13,
  training: 13,
  career: 26,
  learning: 26,
  money: 26,
  other: 13,
};

/** カテゴリ別の理由文(ホトリの断定調敬語。label は「3ヶ月」等の期間表記) */
const FALLBACK_REASONS: Record<string, (label: string) => string> = {
  health: (label) =>
    `生活の習慣は、${label}続けば体が覚えるのが定石です。小さな歩幅で歩き続けるのが、いちばんの近道です。`,
  training: (label) =>
    `体づくりの目標は、まず${label}で土台を作るのが定石です。歩きながら、いつでも調整できます。`,
  career: (label) =>
    `キャリアの目標は、${label}かけて歩むのが現実的です。私の経験では、ここで焦らなかった人ほど遠くまで行きました。`,
  learning: (label) =>
    `学びの道のりは、${label}で景色が変わります。毎日の一歩を小さく保つのが、続けるコツです。`,
  money: (label) =>
    `お金の目標は、${label}の積み重ねで形になります。急ぐより、続く歩幅を選びましょう。`,
};

/**
 * カテゴリ別の決定的なフォールバック見立て。
 * 未知・未設定カテゴリは other 扱い。理由文は成功時と同じ見た目で出すため、
 * エラーの気配を出さない(「通信できません」等は書かない)。
 */
export function fallbackSuggestion(category: string | null | undefined, goalTitle: string): SuggestResponse {
  const key = category != null && category in FALLBACK_WEEKS ? category : 'other';
  const weeks = clampWeeks(FALLBACK_WEEKS[key]);
  const label = weeksLabel(weeks);
  const reasonOf = FALLBACK_REASONS[key];
  if (reasonOf) return { weeks, reason: reasonOf(label) };
  // other / 未知カテゴリ: 目標タイトルを添えて自分の見立てとして語る
  const title = goalTitle.trim();
  const reason = title
    ? `「${title}」への道は、まず${label}歩いてみるのが定石です。歩きながら、いつでも調整できます。`
    : `まずは${label}、一緒に歩いてみるのが定石です。歩きながら、いつでも調整できます。`;
  return { weeks, reason };
}

/**
 * 見立ての先読みキー。目標・カテゴリ・ヒアリング回答が1つでも変われば別キーになり、
 * 橋渡しページ再訪時の再取得判定に使う(キー自体も端末外には出ない)。
 */
export function buildSuggestKey(
  goalTitle: string,
  category: string | null | undefined,
  hearingAnswers: HearingPair[],
): string {
  return JSON.stringify([goalTitle, category ?? null, hearingAnswers.map((p) => [p.question, p.answer])]);
}

/**
 * Promise にタイムアウトを付ける純関数ラッパー。
 * ms 以内に決着しなければ Error('timeout') で reject する(元のPromiseは中断しない)。
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
