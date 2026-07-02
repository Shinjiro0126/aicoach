import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { addDaysKey, todayKey } from '@/lib/dates';
import { scheduleDailyNotifications } from '@/lib/notifications';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';
import { useOnboardingStore } from '@/stores/onboarding';

export default function PlanScreen() {
  const theme = useTheme();
  const { title, why, reset } = useOnboardingStore();
  const { deviceId, morningTime, eveningTime, notificationsEnabled, setActiveGoal } = useAppStore();

  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    generatePlan({ goalTitle: title, why, startDate: todayKey() }, deviceId)
      .then((result) => {
        if (!cancelled) setPlan(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [title, why, deviceId, attempt]);

  const retry = () => {
    setPlan(null);
    setError(false);
    setAttempt((n) => n + 1);
  };

  const start = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const goal = createGoal({ title, why });
      insertWeeklyPlans(goal.id, plan.weeklyFocus);
      const start = todayKey();
      insertDailyActions(
        goal.id,
        plan.dailyActions.map((a) => ({ date: addDaysKey(start, a.dayOffset), description: a.description })),
      );
      addCoachMessage(goal.id, 'assistant', plan.welcomeMessage);
      if (notificationsEnabled) {
        await scheduleDailyNotifications(goal.title, morningTime, eveningTime);
      }
      setActiveGoal(goal);
      reset();
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
        <ThemedText themeColor="textSecondary">「{title}」を毎日の小さな行動に分解しています</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <ThemedText type="subtitle">あなたの計画が{'\n'}できました 🎉</ThemedText>
      </View>

      <Card style={{ backgroundColor: theme.tintSoft }}>
        <ThemedText>{plan.welcomeMessage}</ThemedText>
      </Card>

      <View style={{ gap: Spacing.two }}>
        <ThemedText type="smallBold">4週間のフォーカス</ThemedText>
        {plan.weeklyFocus.map((focus, i) => (
          <Card key={i}>
            <ThemedText type="small" themeColor="textSecondary">
              第{i + 1}週
            </ThemedText>
            <ThemedText>{focus}</ThemedText>
          </Card>
        ))}
      </View>

      <View style={{ gap: Spacing.two }}>
        <ThemedText type="smallBold">今日の最小行動</ThemedText>
        <Card>
          <ThemedText>{plan.dailyActions[0]?.description ?? ''}</ThemedText>
        </Card>
      </View>

      <Button title="この計画で始める" loading={saving} onPress={start} />
      <Button title="計画を作り直す" variant="ghost" onPress={retry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  header: { marginTop: Spacing.four },
});
