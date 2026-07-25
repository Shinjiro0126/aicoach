import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { JourneyStones } from '@/components/journey-stones';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { getWeeklyPlans, listReports } from '@/db/repo';
import type { WeeklyPlan } from '@/db/schema';
import { diffDays, monthMeta, toDateKey, todayKey } from '@/lib/dates';
import {
  buildTeaser,
  coldStartJourneyDays,
  computeInsightStats,
  firstReportDateKey,
  journeyDays,
  MIN_INSIGHT_DAYS,
  notebookSchedule,
  type ReportEntry,
} from '@/lib/insight-stats';
import { progressSummary, weekFlagInfo } from '@/lib/progress';
import { addWeeksKey } from '@/lib/roadmap';
import { computeStreak, type StreakResult } from '@/lib/streak';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function ProgressScreen() {
  const theme = useTheme();
  const goal = useAppStore((s) => s.activeGoal);
  const premium = useAppStore((s) => s.premium);
  const insightCache = useAppStore((s) => s.insight);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [streak, setStreak] = useState<StreakResult>({ current: 0, best: 0, graceUsedOn: [] });
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);

  const today = todayKey();
  const [year, month] = today.split('-').map(Number);

  const refresh = useCallback(() => {
    if (!goal) return;
    // 提出=その日の記録(ホームv2)。カレンダー・ストリークは提出日で数える
    const rows = listReports(goal.id);
    setReports(rows);
    setStreak(computeStreak(rows.map((r) => r.dateKey), todayKey()));
    setPlans(getWeeklyPlans(goal.id));
  }, [goal]);

  useFocusEffect(refresh);

  if (!goal) return null;

  const startKey = toDateKey(new Date(goal.createdAt));
  const targetKey = goal.targetDate ?? addWeeksKey(startKey, 13);
  const summary = progressSummary(startKey, targetKey, today);
  const week = weekFlagInfo(startKey, today, reports.map((r) => r.dateKey));
  const stats = computeInsightStats(reports, today, streak);
  // 手帳の「データ2週」判定は初提出日基準(stats.observedDays と同じ起点)。
  // 目標開始日基準にすると observedDays<14 なのに「あと0日」表示になりうる(Issue #30)
  const schedule = notebookSchedule(firstReportDateKey(reports), today);

  // コールドスタート(開始から2週未満)は「スタートの岸+第1週の旗」レイアウト
  const coldStart = diffDays(startKey, today) + 1 < MIN_INSIGHT_DAYS;
  const stones = coldStart
    ? coldStartJourneyDays(startKey, reports, streak.graceUsedOn, today)
    : journeyDays(reports, streak.graceUsedOn, today);
  const todayReport = reports.find((r) => r.dateKey === today);
  const coldCaption =
    reports.length === 0
      ? 'ここから渡っていきます。最初の一歩を、今日の画面で。'
      : todayReport && reports.length === 1
        ? '今日、最初の石を渡りました。ここから一歩ずつです。'
        : '一歩ずつ、旗まで渡っていきます。';

  // 手帳入口カードの1行(無料=ローカル生成ティザー / プレミアム=最新の見立て)
  const teaser = buildTeaser(stats);
  const cacheMatched =
    insightCache !== null && insightCache.goalId === goal.id && insightCache.weekNo === schedule.availableWeekNo;
  const notebookLine =
    stats.observedDays < MIN_INSIGHT_DAYS
      ? `ホトリが、あなたの歩き方の観察を始めました。最初の見立てまで、あと${schedule.daysToFirst}日です。`
      : premium && cacheMatched
        ? `最新の見立て: 「${insightCache.insight.typeName}」 —— 手帳を開いて読めます。`
        : `今週の見立て: 「${teaser}」 —— 続きは手帳で。`;

  // カレンダー用: 日付キー → 提出記録 / 救済日
  const reportMap = new Map(reports.map((r) => [r.dateKey, r.doneCount]));
  const graceSet = new Set(streak.graceUsedOn);

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

      {/* 飛び石の道のり(直近14日 / コールドスタートは第1週) */}
      <JourneyStones
        days={stones}
        weekNo={week.weekNo}
        daysToFlag={week.daysToFlag}
        reached={summary.reached}
        coldStart={coldStart}
        caption={coldCaption}
      />

      <View style={styles.statsRow}>
        <Card style={[styles.statCard, { backgroundColor: theme.tintSoft }]}>
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
            {stats.walkedDays}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            歩いた日数
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

      {/* カレンダー: 歩いた日=塗り、報告した日=輪郭、救済=浅瀬ソフト、今日=破線 */}
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
            const doneCount = reportMap.get(key);
            const walked = doneCount !== undefined && doneCount > 0;
            const reported = doneCount !== undefined && doneCount === 0;
            const grace = doneCount === undefined && graceSet.has(key);
            const isToday = key === today;
            const isFuture = diffDays(today, key) > 0;
            return (
              <View
                key={key}
                style={[
                  styles.cell,
                  styles.dayCell,
                  walked && { backgroundColor: theme.tint },
                  grace && { backgroundColor: theme.tintSoft },
                  reported && { borderWidth: 1.5, borderColor: theme.tint },
                  !walked && !reported && isToday && {
                    borderWidth: 1.5,
                    borderColor: theme.tintDeep,
                    borderStyle: 'dashed',
                  },
                ]}>
                <ThemedText
                  type="small"
                  style={{
                    color: walked ? theme.onTint : theme.text,
                    opacity: isFuture ? 0.35 : 1,
                  }}>
                  {day}
                </ThemedText>
              </View>
            );
          })}
        </View>
      </Card>

      {/* ホトリの観察手帳への入口 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="ホトリの観察手帳を開く"
        onPress={() => router.push('/notebook')}
        style={({ pressed }) => pressed && { opacity: 0.85 }}>
        <Card style={{ gap: Spacing.two }}>
          <View style={styles.bookHead}>
            <SymbolView name="book.closed" size={16} tintColor={theme.tintDeep} />
            <ThemedText type="smallBold">ホトリの観察手帳</ThemedText>
            <View style={[styles.premiumTag, { backgroundColor: theme.sand }]}>
              <ThemedText style={[styles.premiumTagText, { color: theme.sandText }]}>PREMIUM</ThemedText>
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={{ lineHeight: 20 }}>
            {notebookLine}
          </ThemedText>
        </Card>
      </Pressable>

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
  bookHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  premiumTag: { marginLeft: 'auto', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  premiumTagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
});
