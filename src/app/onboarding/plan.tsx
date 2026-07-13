import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, useAnimatedValue, View } from 'react-native';

import { RoadmapJourney } from '@/components/roadmap-journey';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import {
  addCoachMessage,
  createGoal,
  insertDailyActions,
  insertWeeklyPlans,
} from '@/db/repo';
import { generatePlan } from '@/lib/ai/client';
import type { PlanResponse } from '@/lib/ai/types';
import { AnalyticsEvent, trackEvent } from '@/lib/analytics/posthog';
import { addDaysKey, todayKey } from '@/lib/dates';
import { addMonthsKey } from '@/lib/roadmap';
import { scheduleDailyNotifications } from '@/lib/notifications';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';
import { useOnboardingStore } from '@/stores/onboarding';

/** 生成中に段階表示する進捗ステップ */
const GENERATION_STEPS = ['目標を分析中', '週間フォーカスを設計中', '今日の行動を決定中'];

/** 生成中の進捗ステップ1行。表示されるタイミングでフェードインする */
function GenerationStep({ label, state }: { label: string; state: 'pending' | 'active' | 'done' }) {
  const theme = useTheme();
  const opacity = useAnimatedValue(0);

  useEffect(() => {
    if (state === 'pending') return;
    const anim = Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [state, opacity]);

  return (
    <Animated.View style={[styles.genStep, { opacity }]}>
      {state === 'done' ? (
        <SymbolView name="checkmark.circle.fill" size={20} tintColor={theme.tint} />
      ) : (
        <ActivityIndicator size="small" color={theme.tint} />
      )}
      <ThemedText type="small" themeColor={state === 'done' ? 'textSecondary' : 'text'}>
        {label}
      </ThemedText>
    </Animated.View>
  );
}

export default function PlanScreen() {
  const theme = useTheme();
  const { category, title, durationMonths, why, reset } = useOnboardingStore();
  const { deviceId, morningTime, eveningTime, notificationsEnabled, setActiveGoal } = useAppStore();

  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    generatePlan(
      {
        goalTitle: title,
        why,
        category: category ?? 'other',
        durationMonths,
        targetDate: addMonthsKey(todayKey(), durationMonths),
        startDate: todayKey(),
      },
      deviceId,
    )
      .then((result) => {
        if (!cancelled) {
          setPlan(result);
          trackEvent(AnalyticsEvent.AiPlanGenerated);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [title, why, category, durationMonths, deviceId, attempt]);

  // 生成中の進捗演出をタイマーで進める
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 1700);
    const t2 = setTimeout(() => setStage(2), 3400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [attempt]);

  const retry = () => {
    setPlan(null);
    setError(false);
    setStage(0);
    setAttempt((n) => n + 1);
  };

  const start = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const startDate = todayKey();
      const goal = createGoal({
        title,
        why,
        category: category ?? 'other',
        targetDate: addMonthsKey(startDate, durationMonths),
      });
      insertWeeklyPlans(goal.id, plan.weeklyFocus);
      insertDailyActions(
        goal.id,
        plan.dailyActions.map((a) => ({ date: addDaysKey(startDate, a.dayOffset), description: a.description })),
      );
      addCoachMessage(goal.id, 'assistant', plan.welcomeMessage);
      if (notificationsEnabled) {
        await scheduleDailyNotifications(goal.title, morningTime, eveningTime);
      }
      setActiveGoal(goal);
      reset();
      trackEvent(AnalyticsEvent.OnboardingCompleted);
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <Screen style={styles.center}>
        <ThemedText type="subtitle">計画を作れませんでした</ThemedText>
        <ThemedText themeColor="textSecondary">通信環境を確認して、もう一度お試しください。</ThemedText>
        <Button title="もう一度試す" onPress={retry} />
        <Button title="戻る" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!plan) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator size="large" color={theme.tint} />
        <ThemedText type="smallBold">AIコーチが計画を作成中…</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          「{title}」
        </ThemedText>
        <View style={styles.genSteps}>
          {GENERATION_STEPS.map((label, i) => (
            <GenerationStep
              key={label}
              label={label}
              state={i < stage ? 'done' : i === stage ? 'active' : 'pending'}
            />
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.hero}>
        <View style={[styles.heroCheck, { backgroundColor: theme.tint }]}>
          <SymbolView name="checkmark" size={26} tintColor={theme.onTint} weight="bold" />
        </View>
        <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
          ゴールまでの{'\n'}道のりができました
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          小さな一歩を積み重ねて、順番にマイルストーンを越えていきましょう。
        </ThemedText>
      </View>

      <RoadmapJourney
        todayStep={plan.dailyActions[0]?.description ?? ''}
        weeklyFocus={plan.weeklyFocus}
        goalTitle={title}
        goalLabel={`${durationMonths === 12 ? '1年' : `${durationMonths}ヶ月`}後のゴール`}
        animateIn
      />

      <Button title="最初の一歩を踏み出す" loading={saving} onPress={start} />
      <Button title="計画を作り直す" variant="ghost" onPress={retry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  genSteps: { gap: Spacing.two, marginTop: Spacing.three, alignItems: 'flex-start' },
  genStep: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 24 },
  hero: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.four },
  heroCheck: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
});
