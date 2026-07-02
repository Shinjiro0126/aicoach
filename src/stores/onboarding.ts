import { create } from 'zustand';

/** オンボーディング中の入力を画面間で受け渡すための一時ストア(永続化しない) */
type OnboardingState = {
  title: string;
  why: string;
  setTitle: (title: string) => void;
  setWhy: (why: string) => void;
  reset: () => void;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  title: '',
  why: '',
  setTitle: (title) => set({ title }),
  setWhy: (why) => set({ why }),
  reset: () => set({ title: '', why: '' }),
}));
