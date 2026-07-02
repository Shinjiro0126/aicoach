import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { Config } from '@/constants/config';
import { getActiveGoal } from '@/db/repo';
import type { Goal } from '@/db/schema';
import { todayKey } from '@/lib/dates';
import { makeId } from '@/lib/id';
import { canSendMessage, consumeQuota, remainingQuota, type QuotaState } from '@/lib/quota';

type NotificationTime = { hour: number; minute: number };

type AppState = {
  // ---- 永続化される設定 ----
  deviceId: string;
  morningTime: NotificationTime;
  eveningTime: NotificationTime;
  notificationsEnabled: boolean;
  quota: QuotaState;
  premium: boolean;

  // ---- セッション状態(非永続) ----
  activeGoal: Goal | null;
  goalLoaded: boolean;

  // ---- actions ----
  loadGoal: () => void;
  setActiveGoal: (goal: Goal | null) => void;
  setNotificationTimes: (morning: NotificationTime, evening: NotificationTime) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setPremium: (premium: boolean) => void;
  canSendAiMessage: () => boolean;
  remainingAiMessages: () => number;
  consumeAiMessage: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      deviceId: makeId(),
      morningTime: Config.defaultMorningTime,
      eveningTime: Config.defaultEveningTime,
      notificationsEnabled: false,
      quota: { date: '', used: 0 },
      premium: false,

      activeGoal: null,
      goalLoaded: false,

      loadGoal: () => {
        const goal = getActiveGoal() ?? null;
        set({ activeGoal: goal, goalLoaded: true });
      },
      setActiveGoal: (goal) => set({ activeGoal: goal, goalLoaded: true }),
      setNotificationTimes: (morning, evening) => set({ morningTime: morning, eveningTime: evening }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setPremium: (premium) => set({ premium }),

      canSendAiMessage: () => {
        const s = get();
        return canSendMessage(s.quota, todayKey(), Config.freeDailyMessageLimit, s.premium);
      },
      remainingAiMessages: () => {
        const s = get();
        return remainingQuota(s.quota, todayKey(), Config.freeDailyMessageLimit, s.premium);
      },
      consumeAiMessage: () => set((s) => ({ quota: consumeQuota(s.quota, todayKey()) })),
    }),
    {
      name: 'app-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        deviceId: s.deviceId,
        morningTime: s.morningTime,
        eveningTime: s.eveningTime,
        notificationsEnabled: s.notificationsEnabled,
        quota: s.quota,
        premium: s.premium,
      }),
    },
  ),
);
