import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { getWeeklyPlans, listReportDates } from '@/db/repo';
import type { WeeklyPlan } from '@/db/schema';
import { monthMeta, todayKey } from '@/lib/dates';
import { computeStreak, type StreakResult } from '@/lib/streak';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function ProgressScreen() {
  const theme = useTheme();
  const goal = useAppStore((s) => s.activeGoal);
  const [doneDates, setDoneDates] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState<StreakResult>({ current: 0, best: 0, graceUsedOn: [] });
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);

  const today = todayKey();
  const [year, month] = today.split('-').map(Number);

  const refresh = useCallback(() => {
    if (!goal) return;
    // 提出=その日の記録(ホームv2)。カレンダー・ストリークは提出日で数える
    const dates = listReportDates(goal.id);
    setDoneDates(new Set(dates));
    setStreak(computeStreak(dates, todayKey()));
    setPlans(getWeeklyPlans(goal.id));
  }, [goal]);

  useFocusEffect(refresh);

  if (!goal) return null;

  const { firstWeekday, daysInMonth } = monthMeta(year, month);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Screen scroll withTabInset>
      <ThemedText type="subtitle" style={{ marginTop: Spacing.two }}>
        記録
      </ThemedText>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <ThemedText type="title" style={{ color: theme.tint, fontSize: 36, lineHeight: 40 }}>
            {streak.current}
          </ThemedText>
          <View style={styles.statLabel}>
            <SymbolView name="flame.fill" size={13} tintColor={theme.tint} />
            <ThemedText type="small" themeColor="textSecondary">
              連続日数
            </ThemedText>
          </View>
        </Card>
        <Card style={styles.statCard}>
          <ThemedText type="title" style={{ fontSize: 36, lineHeight: 40 }}>
            {streak.best}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            自己ベスト
          </ThemedText>
        </Card>
        <Card style={styles.statCard}>
          <ThemedText type="title" style={{ fontSize: 36, lineHeight: 40 }}>
            {doneDates.size}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            合計達成日
          </ThemedText>
        </Card>
      </View>

      {streak.graceUsedOn.length > 0 && (
        <View style={styles.graceRow}>
          <SymbolView name="leaf" size={14} tintColor={theme.tint} />
          <ThemedText type="small" themeColor="textSecondary">
            1日おやすみしましたが、ストリークは守られています
          </ThemedText>
        </View>
      )}

      <Card>
        <ThemedText type="smallBold">
          {year}年{month}月
        </ThemedText>
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w) => (
            <ThemedText key={w} type="small" themeColor="textSecondary" style={styles.cell}>
              {w}
            </ThemedText>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (day === null) return <View key={`empty-${i}`} style={styles.cell} />;
            const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const done = doneDates.has(key);
            const isToday = key === today;
            return (
              <View
                key={key}
                style={[
                  styles.cell,
                  styles.dayCell,
                  done && { backgroundColor: theme.tint },
                  !done && isToday && { borderWidth: 1.5, borderColor: theme.tint, borderRadius: 999 },
                ]}>
                <ThemedText type="small" style={{ color: done ? theme.onTint : theme.text }}>
                  {day}
                </ThemedText>
              </View>
            );
          })}
        </View>
      </Card>

      <View style={{ gap: Spacing.two }}>
        <ThemedText type="smallBold">4週間のフォーカス</ThemedText>
        {plans.map((plan) => (
          <Card key={plan.id}>
            <ThemedText type="small" themeColor="textSecondary">
              第{plan.weekNo}週
            </ThemedText>
            <ThemedText>{plan.focus}</ThemedText>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  statCard: { flex: 1, alignItems: 'center' },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  graceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  weekRow: { flexDirection: 'row', marginTop: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 6 },
  dayCell: { borderRadius: 999, aspectRatio: 1, justifyContent: 'center', paddingVertical: 0, marginVertical: 2 },
});
