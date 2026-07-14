import { create } from 'zustand';

import type { GoalCategory } from '@/constants/categories';

/** オンボーディング中の入力を画面間で受け渡すための一時ストア(永続化しない) */
type OnboardingState = {
  category: GoalCategory | null;
  title: string;
  /** 達成期間(月数)。期間画面のデフォルトは3ヶ月 */
  durationMonths: number;
  why: string;
  setCategory: (category: GoalCategory) => void;
  setTitle: (title: string) => void;
  setDurationMonths: (durationMonths: number) => void;
  setWhy: (why: string) => void;
  reset: () => void;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  category: null,
  title: '',
  durationMonths: 3,
  why: '',
  setCategory: (category) => set({ category }),
  setTitle: (title) => set({ title }),
  setDurationMonths: (durationMonths) => set({ durationMonths }),
  setWhy: (why) => set({ why }),
  reset: () => set({ category: null, title: '', durationMonths: 3, why: '' }),
}));
