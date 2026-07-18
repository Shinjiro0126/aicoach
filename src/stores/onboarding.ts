import { create } from 'zustand';

import type { GoalCategory } from '@/constants/categories';

/**
 * オンボーディング中の入力を画面間で受け渡すための一時ストア(永続化しない)。
 * 「戻る」で前の画面に戻っても入力が消えないよう、各画面のローカルstateではなく
 * このストアを唯一の置き場にする。
 */
type OnboardingState = {
  category: GoalCategory | null;
  title: string;
  /**
   * 達成期間(週数)。null は「まだユーザーが選んでいない」状態で、
   * 期間画面がAIおすすめ(または既定の3ヶ月相当)を初期選択として表示する。
   */
  durationWeeks: number | null;
  why: string;
  /** 現在地ヒアリングの回答(質問id → 選んだチップの文言)。端末外には保存しない */
  hearingAnswers: Record<string, string>;
  setCategory: (category: GoalCategory) => void;
  setTitle: (title: string) => void;
  setDurationWeeks: (durationWeeks: number) => void;
  setWhy: (why: string) => void;
  setHearingAnswer: (questionId: string, answer: string) => void;
  reset: () => void;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  category: null,
  title: '',
  durationWeeks: null,
  why: '',
  hearingAnswers: {},
  // カテゴリを変更したらヒアリング回答はリセットする(質問セットが変わるため)。
  // 同じカテゴリを選び直した場合は回答を保持する(戻る導線で入力を失わせない)
  setCategory: (category) =>
    set((state) => (state.category === category ? { category } : { category, hearingAnswers: {} })),
  setTitle: (title) => set({ title }),
  setDurationWeeks: (durationWeeks) => set({ durationWeeks }),
  setWhy: (why) => set({ why }),
  setHearingAnswer: (questionId, answer) =>
    set((state) => ({ hearingAnswers: { ...state.hearingAnswers, [questionId]: answer } })),
  reset: () => set({ category: null, title: '', durationWeeks: null, why: '', hearingAnswers: {} }),
}));
