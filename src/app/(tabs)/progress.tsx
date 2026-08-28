import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { JourneyStones } from '@/components/journey-stones';
import { RecordCalendar } from '@/components/record-calendar';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { getWeeklyPlans, listReports } from '@/db/repo';
import type { WeeklyPlan } from '@/db/schema';
import { toDateKey, todayKey } from '@/lib/dates';
import {
  buildTeaser,
  coldStartJourneyDays,
  computeInsightStats,
  firstReportDateKey,
  isJourneyColdStart,
  MIN_INSIGHT_DAYS,
  notebookSchedule,
  weekAlignedJourneyDays,
  type ReportEntry,
} from '@/lib/insight-stats';
import { progressSummary, weekFlagInfo } from '@/lib/progress';
import { addWeeksKey } from '@/lib/roadmap';
import { computeStreak, type StreakResult } from '@/lib/streak';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

export default function ProgressScreen() {
  const theme = useTheme();
  const goal = useAppStore((s) => s.activeGoal);
  const premium = useAppStore((s) => s.premium);
  const insightCache = useAppStore((s) => s.insight);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [streak, setStreak] = useState<StreakResult>({ current: 0, best: 0, graceUsedOn: [] });
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);

  const today = todayKey();

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

  // 第1週(開始から7日未満)のみ「スタートの岸+第1週の旗」レイアウト。
  // 第2週からは週アラインの14日レイアウト(上段=先週、下段=今週)に切り替わる
  const coldStart = isJourneyColdStart(startKey, today);
  const stones = coldStart
    ? coldStartJourneyDays(startKey, reports, streak.graceUsedOn, today)
    : weekAlignedJourneyDays(startKey, reports, streak.graceUsedOn, today);
  const todayReport = reports.find((r) => r.dateKey === today);
  // 「旗まであとn日」=今日より後の今週の日数。点線(これから)の石の数と常に一致させる
  // (今日提出済みでも今日の石は点線にならないため、提出有無で数字を変えない)
  const daysToFlag = week.daysToFlag - 1;
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

  return (
    <Screen scroll withTabInset>
      <ThemedText type="subtitle" style={{ marginTop: Spacing.two }}>
        記録
      </ThemedText>

      {/* 飛び石の道のり(直近14日 / コールドスタートは第1週) */}
      <JourneyStones
        days={stones}
        weekNo={week.weekNo}
        daysToFlag={daysToFlag}
        reached={summary.reached}
        coldStart={coldStart}
        caption={coldCaption}
      />

      {/* 統合カレンダーカード: 統計帯+月送り+連続の帯+救済メッセージ+凡例 */}
      <RecordCalendar
        reports={reports}
        streak={streak}
        walkedDays={stats.walkedDays}
        startKey={startKey}
        today={today}
      />

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
  bookHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  premiumTag: { marginLeft: 'auto', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  premiumTagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
});
