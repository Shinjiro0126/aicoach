import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Hotori } from '@/components/hotori';
import { PrivacyBadge } from '@/components/privacy-badge';
import { RoadmapJourney } from '@/components/roadmap-journey';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { toHearingPairs } from '@/constants/hearing';
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
import { addWeeksKey, monthsToWeeks, weeksLabel } from '@/lib/roadmap';
import { scheduleDailyNotifications } from '@/lib/notifications';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';
import { useOnboardingStore } from '@/stores/onboarding';

/**
 * 生成中に表示する「専属サマリー」の1行。
 * ヒアリングで聞いた内容がそのまま計画に使われている証拠を見せる。
 */
function RecapRow({ k, v, ai }: { k: string; v: ReactNode; ai?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.recapRow, { backgroundColor: ai ? theme.tintSoft : theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.recapKey}>
        {k}
      </ThemedText>
      <ThemedText type="small" style={styles.recapValue}>
        {v}
      </ThemedText>
    </View>
  );
}

export default function PlanScreen() {
  const theme = useTheme();
  const { category, title, durationWeeks, why, hearingAnswers, reset } = useOnboardingStore();
  const { deviceId, morningTime, eveningTime, notificationsEnabled, setActiveGoal } = useAppStore();

  // 期間画面で必ず確定されるが、念のためのフォールバック(3ヶ月相当)
  const weeks = durationWeeks ?? monthsToWeeks(3);
  const answers = toHearingPairs(category, hearingAnswers).map((p) => p.answer);

  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    generatePlan(
      {
        goalTitle: title,
        why,
        category: category ?? 'other',
        durationWeeks: weeks,
        hearingAnswers: toHearingPairs(category, hearingAnswers),
        targetDate: addWeeksKey(todayKey(), weeks),
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
  }, [title, why, category, weeks, hearingAnswers, deviceId, attempt]);

  const retry = () => {
    setPlan(null);
    setError(false);
    setAttempt((n) => n + 1);
  };

  const start = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const startDate = todayKey();
      const pairs = toHearingPairs(category, hearingAnswers);
      const goal = createGoal({
        title,
        why,
        category: category ?? 'other',
        targetDate: addWeeksKey(startDate, weeks),
        hearingAnswers: pairs.length > 0 ? JSON.stringify(pairs) : undefined,
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
    // 生成中: 「あなた専用」の証拠として、聞いた内容がどう計画に使われるかを見せる
    return (
      <Screen scroll style={styles.generating}>
        <View style={styles.hotoriCenter}>
          <Hotori pose="thinking" animate="thinking" size={120} />
        </View>
        <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
          あなた専用の計画を{'\n'}仕立てています…
        </ThemedText>
        <View style={styles.recap}>
          <RecapRow k="目標" v={title} />
          {answers.length > 0 && (
            <RecapRow
              ai
              k="現在地"
              v={
                <>
                  {answers.join('・')} →{' '}
                  <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
                    最初の週は軽めに始めます
                  </ThemedText>
                </>
              }
            />
          )}
          <RecapRow
            ai
            k="期間"
            v={
              <>
                <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
                  {weeksLabel(weeks)}({weeks}週間)
                </ThemedText>{' '}
                → 週ごとのペース配分に反映します
              </>
            }
          />
          <RecapRow k="動機" v={why} />
        </View>
        <PrivacyBadge text="この内容が端末の外に保存されることはありません" style={styles.privacy} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.hero}>
        <Hotori pose="celebrate" size={104} />
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
        goalLabel={`${weeksLabel(weeks)}後のゴール`}
        animateIn
      />

      <Button title="最初の一歩を踏み出す" loading={saving} onPress={start} />
      <Button title="計画を作り直す" variant="ghost" onPress={retry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  generating: { paddingTop: Spacing.six },
  hotoriCenter: { alignItems: 'center' },
  recap: { gap: Spacing.two, marginTop: Spacing.two },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderRadius: 14,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.three - 4,
  },
  recapKey: { width: 52, fontWeight: '700' },
  recapValue: { flex: 1, lineHeight: 20 },
  privacy: { alignItems: 'center', marginTop: Spacing.two },
  hero: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.four },
});
