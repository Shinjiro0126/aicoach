import { create } from 'zustand';

import type { GoalCategory } from '@/constants/categories';
import type { SuggestResponse } from '@/lib/ai/types';

/**
 * オンボーディング中の入力を画面間で受け渡すための一時ストア(永続化しない)。
 * 「戻る」で前の画面に戻っても入力が消えないよう、各画面のローカルstateではなく
 * このストアを唯一の置き場にする。
 */

/** 期間おすすめの先読み(橋渡しページで開始し、期間ページで共有する) */
export type SuggestionEntry = {
  /** 入力(目標・カテゴリ・ヒアリング回答)から作るキー。変わったら再取得する */
  key: string;
  /** 取得中のPromise(フォールバック保証つきで reject しない前提) */
  promise: Promise<SuggestResponse>;
  /** 解決済みの結果。null の間は取得中(期間ページの「考え中」表示の判定に使う) */
  result: SuggestResponse | null;
};

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
  /** 期間おすすめの先読み結果。入力が変わったら ensureSuggestion が取り直す */
  suggestion: SuggestionEntry | null;
  setCategory: (category: GoalCategory) => void;
  setTitle: (title: string) => void;
  setDurationWeeks: (durationWeeks: number) => void;
  setWhy: (why: string) => void;
  setHearingAnswer: (questionId: string, answer: string) => void;
  /** 指定した質問idの回答をまとめて削除する(回答の選び直し用。以降の質問も含めて渡す) */
  clearHearingAnswers: (questionIds: string[]) => void;
  /**
   * key の見立てを先読みする。同じ key の取得が既にあれば何もしない(重複リクエスト防止)。
   * start は reject しない Promise を返すこと(suggestDurationWithFallback を渡す)。
   */
  ensureSuggestion: (key: string, start: () => Promise<SuggestResponse>) => void;
  reset: () => void;
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  category: null,
  title: '',
  durationWeeks: null,
  why: '',
  hearingAnswers: {},
  suggestion: null,
  // カテゴリを変更したらヒアリング回答はリセットする(質問セットが変わるため)。
  // 同じカテゴリを選び直した場合は回答を保持する(戻る導線で入力を失わせない)
  setCategory: (category) =>
    set((state) => (state.category === category ? { category } : { category, hearingAnswers: {} })),
  setTitle: (title) => set({ title }),
  setDurationWeeks: (durationWeeks) => set({ durationWeeks }),
  setWhy: (why) => set({ why }),
  setHearingAnswer: (questionId, answer) =>
    set((state) => ({ hearingAnswers: { ...state.hearingAnswers, [questionId]: answer } })),
  // ヒアリングは「先頭から連続回答済みの数」で表示位置を決めるため、
  // 選び直す質問"以降"のidを呼び出し側でまとめて渡し、その質問からやり直せるようにする
  clearHearingAnswers: (questionIds) =>
    set((state) => {
      const next = { ...state.hearingAnswers };
      for (const id of questionIds) delete next[id];
      return { hearingAnswers: next };
    }),
  ensureSuggestion: (key, start) => {
    if (get().suggestion?.key === key) return;
    const promise = start();
    set({ suggestion: { key, promise, result: null } });
    promise.then((result) => {
      // 解決までに入力が変わって別keyの取得が始まっていたら、この結果は捨てる
      const current = get().suggestion;
      if (current?.key === key) set({ suggestion: { ...current, result } });
    });
  },
  reset: () =>
    set({ category: null, title: '', durationWeeks: null, why: '', hearingAnswers: {}, suggestion: null }),
}));
