import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Fragment, useCallback, useState } from 'react';
import { Animated, Pressable, StyleSheet, useAnimatedValue, View } from 'react-native';

import { RoadmapJourney } from '@/components/roadmap-journey';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import {
  getActionForDate,
  getLatestAction,
  getWeeklyPlans,
  listDoneDates,
  setActionDone,
  upsertActionForDate,
} from '@/db/repo';
import type { DailyAction, WeeklyPlan } from '@/db/schema';
import { AnalyticsEvent, trackEvent } from '@/lib/analytics/posthog';
import { formatJP, toDateKey, todayKey } from '@/lib/dates';
import { currentWeekNo, durationMonthsBetween, ROADMAP_WEEKS } from '@/lib/roadmap';
import { computeStreak } from '@/lib/streak';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

export default function HomeScreen() {
  const theme = useTheme();
  const goal = useAppStore((s) => s.activeGoal);
  const [action, setAction] = useState<DailyAction | null>(null);
  const [streak, setStreak] = useState({ current: 0, best: 0 });
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [roadmapExpanded, setRoadmapExpanded] = useState(false);
  const chevronRotation = useAnimatedValue(0);

  const today = todayKey();

  const refresh = useCallback(() => {
    if (!goal) return;
    setAction(getActionForDate(goal.id, today) ?? null);
    const result = computeStreak(listDoneDates(goal.id), today);
    setStreak({ current: result.current, best: result.best });
    setPlans(getWeeklyPlans(goal.id));
  }, [goal, today]);

  useFocusEffect(refresh);

  if (!goal) return null;

  const toggleDone = () => {
    if (!action) return;
    const newDone = !action.done;
    setActionDone(action.id, newDone);
    if (newDone) {
      const result = computeStreak(listDoneDates(goal.id), today);
      trackEvent(AnalyticsEvent.StreakAchieved, { streakCount: result.current });
    }
    refresh();
  };

  const createTodayAction = () => {
    const latest = getLatestAction(goal.id);
    const description = latest?.description ?? `「${goal.title}」のために10分取り組む`;
    upsertActionForDate(goal.id, today, description);
    refresh();
  };

  const toggleRoadmap = () => {
    Animated.timing(chevronRotation, {
      toValue: roadmapExpanded ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setRoadmapExpanded((v) => !v);
  };

  const startKey = toDateKey(new Date(goal.createdAt));
  const totalWeeks = plans.length || ROADMAP_WEEKS;
  const week = currentWeekNo(startKey, today, totalWeeks);
  const currentFocus = plans[week - 1]?.focus ?? '';
  const goalLabel = goal.targetDate
    ? (() => {
        const months = durationMonthsBetween(startKey, goal.targetDate);
        return `${months === 12 ? '1年' : `${months}ヶ月`}後のゴール`;
      })()
    : 'ゴール';

  return (
    <Screen scroll withTabInset>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatJP(today)}
        </ThemedText>
        <ThemedText type="subtitle">{goal.title}</ThemedText>
        <View style={styles.streakRow}>
          <View style={styles.streakBadge}>
            <SymbolView name="flame.fill" size={16} tintColor={theme.tint} />
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {streak.current}日連続
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            ベスト {streak.best}日
          </ThemedText>
        </View>
      </View>

      {action ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            今日の最小行動
          </ThemedText>
          <ThemedText type="default" style={{ fontSize: 18 }}>
            {action.description}
          </ThemedText>

          <Pressable
            accessibilityRole="button"
            onPress={toggleDone}
            style={({ pressed }) => [
              styles.checkButton,
              {
                backgroundColor: action.done ? theme.tintSoft : theme.tint,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            {action.done && <SymbolView name="checkmark" size={16} tintColor={theme.tint} weight="bold" />}
            <ThemedText
              style={{
                color: action.done ? theme.tint : theme.onTint,
                fontWeight: '700',
                fontSize: 17,
              }}>
              {action.done ? '達成しました' : 'できた!'}
            </ThemedText>
          </Pressable>
        </Card>
      ) : (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            今日の行動がまだ決まっていません
          </ThemedText>
          <Button title="今日の行動を決める" onPress={createTodayAction} />
          <Button title="コーチに相談する" variant="secondary" onPress={() => router.push('/coach')} />
        </Card>
      )}

      {action?.done && (
        <Card style={{ backgroundColor: theme.tintSoft }}>
          <ThemedText>
            おつかれさまでした!夜にコーチと1分だけ振り返ると、明日がもっと楽になります。
          </ThemedText>
          <Button title="コーチと振り返る" variant="secondary" onPress={() => router.push('/coach')} />
        </Card>
      )}

      {plans.length > 0 && (
        <Card>
          <Pressable accessibilityRole="button" onPress={toggleRoadmap} style={styles.roadmapHeader}>
            <ThemedText type="smallBold">ロードマップ</ThemedText>
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: chevronRotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '180deg'],
                    }),
                  },
                ],
              }}>
              <SymbolView name="chevron.down" size={14} tintColor={theme.textSecondary} weight="semibold" />
            </Animated.View>
          </Pressable>

          {roadmapExpanded ? (
            <RoadmapJourney
              weeklyFocus={plans.map((p) => p.focus)}
              goalTitle={goal.title}
              goalLabel={goalLabel}
              currentWeek={week}
              animateIn
            />
          ) : (
            <>
              <View style={styles.miniBar}>
                {Array.from({ length: totalWeeks + 1 }, (_, i) => {
                  // i=0 はスタート地点、i>=1 は第i週。経過した週(現在週まで)をtintで塗る
                  const filled = i <= week;
                  return (
                    <Fragment key={i}>
                      {i > 0 && (
                        <View
                          style={[
                            styles.miniLine,
                            { backgroundColor: filled ? theme.tint : theme.backgroundSelected },
                          ]}
                        />
                      )}
                      <View
                        style={[
                          styles.miniDot,
                          { backgroundColor: filled ? theme.tint : theme.backgroundSelected },
                        ]}
                      />
                    </Fragment>
                  );
                })}
                <View style={[styles.miniLine, { backgroundColor: theme.backgroundSelected }]} />
                <SymbolView name="flag.fill" size={14} tintColor={theme.textSecondary} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                いま: 第{week}週 {currentFocus}
              </ThemedText>
            </>
          )}
        </Card>
      )}

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          あなたの動機
        </ThemedText>
        <ThemedText>{goal.why}</ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.one, marginTop: Spacing.two },
  streakRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  checkButton: {
    minHeight: 64,
    borderRadius: 16,
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  roadmapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miniBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.one },
  miniDot: { width: 10, height: 10, borderRadius: 999 },
  miniLine: { flex: 1, height: 2, borderRadius: 1 },
});
