import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { Config } from '@/constants/config';
import { getActiveGoal } from '@/db/repo';
import type { Goal } from '@/db/schema';
import type { InsightResponse } from '@/lib/ai/types';
import { todayKey } from '@/lib/dates';
import { makeId } from '@/lib/id';
import type { PaceDeclaration } from '@/lib/pace';
import { canSendMessage, consumeQuota, remainingQuota, type QuotaState } from '@/lib/quota';

type NotificationTime = { hour: number; minute: number };

/**
 * 観察手帳のキャッシュ(最新1件)。
 * DBでなく永続ストアに置く理由: 週1回更新の最新スナップショットのみで履歴・リレーションが不要なため、
 * SQLiteマイグレーション(末尾追加のみ)を増やさず AsyncStorage 永続で持つ。
 * 応答は端末の中だけに保存される(サーバー保存はしない)
 */
export type InsightCacheEntry = {
  goalId: string;
  /** 観察対象の週番号(notebookSchedule.availableWeekNo) */
  weekNo: number;
  insight: InsightResponse;
  generatedAt: number;
  /** フォールバック文で組み立てた応答か(後の再生成判定に使う) */
  fallback: boolean;
};

type AppState = {
  // ---- 永続化される設定 ----
  deviceId: string;
  morningTime: NotificationTime;
  eveningTime: NotificationTime;
  notificationsEnabled: boolean;
  quota: QuotaState;
  premium: boolean;
  /** 観察手帳の最新キャッシュ(端末内のみに保存) */
  insight: InsightCacheEntry | null;
  /**
   * 来週の歩幅宣言(旗の日セレモニーの3択)。goalId・forWeekNo で対象目標・対象週をスコープし、
   * 効くのは宣言した目標の翌週のみ(判定は lib/pace.ts の effectivePace。
   * 目標リセット後の新目標には goalId 不一致で効かない)
   */
  nextWeekPace: PaceDeclaration | null;

  // ---- セッション状態(非永続) ----
  activeGoal: Goal | null;
  goalLoaded: boolean;

  // ---- actions ----
  loadGoal: () => void;
  setActiveGoal: (goal: Goal | null) => void;
  setNotificationTimes: (morning: NotificationTime, evening: NotificationTime) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setPremium: (premium: boolean) => void;
  setInsight: (entry: InsightCacheEntry | null) => void;
  setNextWeekPace: (declaration: PaceDeclaration | null) => void;
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
      insight: null,
      nextWeekPace: null,

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
      setInsight: (entry) => set({ insight: entry }),
      setNextWeekPace: (declaration) => set({ nextWeekPace: declaration }),

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
        insight: s.insight,
        nextWeekPace: s.nextWeekPace,
      }),
    },
  ),
);
