import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import {
  getActionForDate,
  getLatestAction,
  listDoneDates,
  setActionDone,
  upsertActionForDate,
} from '@/db/repo';
import type { DailyAction } from '@/db/schema';
import { AnalyticsEvent, trackEvent } from '@/lib/analytics/posthog';
import { formatJP, todayKey } from '@/lib/dates';
import { computeStreak } from '@/lib/streak';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

export default function HomeScreen() {
  const theme = useTheme();
  const goal = useAppStore((s) => s.activeGoal);
  const [action, setAction] = useState<DailyAction | null>(null);
  const [streak, setStreak] = useState({ current: 0, best: 0 });

  const today = todayKey();

  const refresh = useCallback(() => {
    if (!goal) return;
    setAction(getActionForDate(goal.id, today) ?? null);
    const result = computeStreak(listDoneDates(goal.id), today);
    setStreak({ current: result.current, best: result.best });
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

  return (
    <Screen scroll withTabInset>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatJP(today)}
        </ThemedText>
        <ThemedText type="subtitle">{goal.title}</ThemedText>
        <View style={styles.streakRow}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            🔥 {streak.current}日連続
          </ThemedText>
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
            <ThemedText
              style={{
                color: action.done ? theme.tint : theme.onTint,
                fontWeight: '700',
                fontSize: 17,
              }}>
              {action.done ? '✓ 達成しました' : 'できた!'}
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
  checkButton: {
    minHeight: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
});
