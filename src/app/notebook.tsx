import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Hotori } from '@/components/hotori';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { listReports } from '@/db/repo';
import { generateInsightWithFallback } from '@/lib/ai/client';
import type { InsightRequest } from '@/lib/ai/types';
import { formatJP, todayKey } from '@/lib/dates';
import {
  buildInsightFallback,
  buildTeaser,
  comebackText,
  computeInsightStats,
  firstReportDateKey,
  insightGenerationPlan,
  maxTimeBand,
  notebookSchedule,
  TIME_BAND_LABELS,
  WEEKDAY_LABELS,
  type InsightContent,
  type InsightStats,
  type ReportEntry,
} from '@/lib/insight-stats';
import { computeStreak, type StreakResult } from '@/lib/streak';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

/**
 * ホトリの観察手帳(デザイン02/03/05)。
 * - 無料: 本物のティザー1行+ぼかした手帳プレビュー+paywallへのCTA
 * - プレミアム(データ2週以上): 手紙風総評・タイプ・曜日/時間帯/復帰力・来週の作戦
 * - プレミアム(データ2週未満): 「観察中です。」+最初の手帳までのカウントダウン
 * 生成に使うのは端末内で集計した統計値のみ。応答も端末の中だけに保存される。
 */

function PremiumTag() {
  const theme = useTheme();
  return (
    <View style={[styles.premiumTag, { backgroundColor: theme.sand }]}>
      <ThemedText style={[styles.premiumTagText, { color: theme.sandText }]}>PREMIUM</ThemedText>
    </View>
  );
}

function NotebookHeader() {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="戻る"
        onPress={() => router.back()}
        hitSlop={10}>
        <SymbolView name="chevron.left" size={20} tintColor={theme.text} weight="semibold" />
      </Pressable>
      <ThemedText style={styles.headerTitle}>ホトリの観察手帳</ThemedText>
      <PremiumTag />
    </View>
  );
}

function PrivacyRow() {
  const theme = useTheme();
  return (
    <View style={styles.privacyRow}>
      <SymbolView name="lock.fill" size={11} tintColor={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
        手帳の分析も、記録と同じく端末の中だけに保存されます
      </ThemedText>
    </View>
  );
}

/**
 * ぼかしテキスト(無料のロックプレビュー用)。
 * 文字色を透明にし、影だけをにじませることで「実データが書かれているが読めない」状態を作る
 * (expo-blur を追加せずにテキストだけを判読不能にする)
 */
function BlurredText({ text, bold }: { text: string; bold?: boolean }) {
  const theme = useTheme();
  return (
    <ThemedText
      type={bold ? 'smallBold' : 'small'}
      style={{
        color: 'transparent',
        textShadowColor: theme.textSecondary,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 7,
      }}>
      {text}
    </ThemedText>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.secLabel}>
      {label}
    </ThemedText>
  );
}

/** 曜日別バー(単一色相。単独最多のみ深瀬+「最強」ラベル) */
function WeekdayBars({ counts, showMaxTag }: { counts: number[]; showMaxTag?: boolean }) {
  const theme = useTheme();
  const maxValue = Math.max(...counts);
  const maxIndex = counts.indexOf(maxValue);
  const isUniqueMax = maxValue > 0 && counts.filter((c) => c === maxValue).length === 1;
  const scale = Math.max(maxValue, 1);
  return (
    <View style={[styles.bars, { borderBottomColor: theme.border }]}>
      {counts.map((count, i) => {
        const isMax = isUniqueMax && i === maxIndex;
        return (
          <View key={WEEKDAY_LABELS[i]} style={styles.barCol}>
            {isMax && showMaxTag && (
              <ThemedText style={[styles.maxTag, { color: theme.tintDeep }]}>最強</ThemedText>
            )}
            <View
              style={[
                styles.bar,
                { height: 6 + (count / scale) * 52, backgroundColor: isMax ? theme.tintDeep : theme.tint },
              ]}
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.barLabel}>
              {WEEKDAY_LABELS[i]}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

/** 記録の時間帯3セル(朝/昼/夜。単独最多を浅瀬ソフトで強調) */
function TimeBandCells({ stats }: { stats: InsightStats }) {
  const theme = useTheme();
  const total = stats.timeBands.morning + stats.timeBands.midday + stats.timeBands.night;
  const max = maxTimeBand(stats.timeBands);
  const bands = [
    { key: 'morning' as const, label: '朝' },
    { key: 'midday' as const, label: '昼' },
    { key: 'night' as const, label: '夜' },
  ];
  return (
    <View style={styles.timeRow}>
      {bands.map(({ key, label }) => {
        const isMax = max === key;
        const pct = total > 0 ? Math.round((stats.timeBands[key] / total) * 100) : 0;
        return (
          <View
            key={key}
            style={[
              styles.timeCell,
              { borderColor: theme.border, backgroundColor: theme.background },
              isMax && { backgroundColor: theme.tintSoft, borderColor: 'transparent' },
            ]}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
              {label}
            </ThemedText>
            <ThemedText type="smallBold" style={{ fontSize: 16, color: isMax ? theme.tintDeep : theme.text }}>
              {pct}%
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

/** 復帰力カード(分母ゼロは「まだ一度も止まっていません」) */
function ComebackCard({ stats }: { stats: InsightStats }) {
  const theme = useTheme();
  return (
    <View style={[styles.comeback, { borderColor: theme.border, backgroundColor: theme.background }]}>
      {stats.stops > 0 ? (
        <ThemedText style={[styles.comebackPct, { color: theme.tint }]}>
          {Math.round((stats.nextDayReturns / stats.stops) * 100)}%
        </ThemedText>
      ) : (
        // 一度も止まっていない場合は文脈のない「0回」を出さず、歩き続けている図像で代える
        <SymbolView name="figure.walk" size={26} tintColor={theme.tint} />
      )}
      <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1, lineHeight: 19 }}>
        {comebackText(stats)}
      </ThemedText>
    </View>
  );
}

/** 手紙風の総評カード(sand+ホトリ署名) */
function LetterCard({ letter }: { letter: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.letter, { backgroundColor: theme.sand }]}>
      <ThemedText type="small" style={{ color: theme.sandText, lineHeight: 22 }}>
        {letter}
      </ThemedText>
      <View style={styles.letterSig}>
        <Hotori variant="bust" size={18} />
        <ThemedText type="small" style={{ color: theme.sandText, fontWeight: '700', fontSize: 12 }}>
          ホトリ
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * 生成中ガード(goalId:週番号)。画面のアンマウント直後の再入で旧リクエストが生きたまま
 * 新規生成が走らないよう、ref ではなくモジュールスコープに置く
 */
const inFlightInsightKeys = new Set<string>();

export default function NotebookScreen() {
  const theme = useTheme();
  const goal = useAppStore((s) => s.activeGoal);
  const premium = useAppStore((s) => s.premium);
  const insightCache = useAppStore((s) => s.insight);
  const setInsight = useAppStore((s) => s.setInsight);
  const deviceId = useAppStore((s) => s.deviceId);

  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [streak, setStreak] = useState<StreakResult>({ current: 0, best: 0, graceUsedOn: [] });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    if (!goal) return;
    const rows = listReports(goal.id);
    setReports(rows);
    setStreak(computeStreak(rows.map((r) => r.dateKey), todayKey()));
    setLoaded(true);
  }, [goal]);

  useFocusEffect(refresh);

  const today = todayKey();
  // 「データ2週」の判定は初提出日基準(stats.observedDays と同じ起点)に統一(Issue #30)
  const schedule = notebookSchedule(firstReportDateKey(reports), today);
  const stats = computeInsightStats(reports, today, streak);

  const cacheMatched =
    goal !== null &&
    insightCache !== null &&
    insightCache.goalId === goal.id &&
    insightCache.weekNo === schedule.availableWeekNo;

  useEffect(() => {
    if (!goal || !premium) return;
    // 手帳が現行週のキャッシュで表示できており、フォールバック再試行も不要なら何もしない。
    // 依存の cacheMatched は表示ゲートと同じレンダー時計算のため、画面を開いたまま週の旗の日を
    // 跨ぐと cacheMatched が false へ落ちて考え中画面になるのと同じ再レンダーでこの effect も
    // 再実行され、「表示条件は進むがトリガーが進まない」固まりを防ぐ(Issue #31)
    if (cacheMatched && insightCache !== null && !insightCache.fallback) return;
    // マウントコミット時点では useFocusEffect(refresh) の setReports がまだ state に反映されておらず、
    // 空の reports から全ゼロ統計で生成・キャッシュしてしまうため(Issue #29)、
    // 生成の判定と集計は state を介さず DB から直接読み直した記録で行う
    const todayNow = todayKey();
    const rows = listReports(goal.id);
    const freshStreak = computeStreak(rows.map((r) => r.dateKey), todayNow);
    const freshSchedule = notebookSchedule(firstReportDateKey(rows), todayNow);
    // データ2週未満(観察中)は生成しない。キャッシュが現行週と一致していれば新規生成も不要。
    // フォールバック文で保存された週は、次に開いたとき静かに再生成を試みる(insightGenerationPlan)。
    // プレミアム化した瞬間も、蓄積データがあれば同じ条件で即生成される
    const plan = insightGenerationPlan(insightCache, goal.id, freshSchedule.availableWeekNo);
    if (!plan.generate) return;
    const key = `${goal.id}:${freshSchedule.availableWeekNo}`;
    if (inFlightInsightKeys.has(key)) return;
    inFlightInsightKeys.add(key);
    const request: InsightRequest = {
      ...computeInsightStats(rows, todayNow, freshStreak),
      weekNo: freshSchedule.availableWeekNo,
      category: goal.category,
    };
    // 失敗・タイムアウトでもフォールバック文で必ず解決する(rejectしない)
    generateInsightWithFallback(request, deviceId).then((result) => {
      inFlightInsightKeys.delete(key);
      // 再生成の試みが再び失敗した場合は、表示中のフォールバック文を上書きしない
      if (plan.retryFallback && result.fallback) return;
      setInsight({
        goalId: goal.id,
        weekNo: freshSchedule.availableWeekNo,
        insight: result.insight,
        generatedAt: Date.now(),
        fallback: result.fallback,
      });
    });
  }, [goal, premium, insightCache, deviceId, setInsight, cacheMatched]);

  if (!goal) return null;

  // フォーカス反映前の空 state で観察中/ティザー画面を一瞬描画しないよう、読み込み完了まではヘッダーのみ
  if (!loaded) {
    return (
      <Screen scroll>
        <NotebookHeader />
      </Screen>
    );
  }

  // ---- 無料: ティザー+ぼかしプレビュー+CTA(デザイン02) ----
  if (!premium) {
    const preview: InsightContent = buildInsightFallback(stats);
    return (
      <Screen scroll>
        <NotebookHeader />
        <ThemedText type="small" themeColor="textSecondary" style={{ lineHeight: 20 }}>
          {stats.observedDays > 0
            ? `ホトリは${stats.observedDays}日間、あなたの歩き方を見てきました。手帳には、あなただけのパターンが書かれています。`
            : 'ホトリが、あなたの歩き方の観察を始めます。手帳には、あなただけのパターンが書かれていきます。'}
        </ThemedText>

        <View style={[styles.teaser, { backgroundColor: theme.tintSoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.tintDeep, fontSize: 12 }}>
            今週のひとこと見立て(無料)
          </ThemedText>
          <ThemedText type="small" style={{ lineHeight: 21 }}>
            {buildTeaser(stats)}
          </ThemedText>
        </View>

        {/* ぼかした手帳プレビュー(実データの集計を薄く見せるが読めない)。
            透明文字+影は視覚的には判読不能でもアクセシビリティツリーには乗るため、
            VoiceOver がロック内容を全文読み上げないよう区画ごと隠す */}
        <Card style={{ gap: Spacing.two + 2 }}>
          <View
            style={{ gap: Spacing.two + 2 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <SectionLabel label="あなたの歩き方タイプ" />
            <View style={[styles.typeBadge, { backgroundColor: theme.tintSoft }]}>
              <BlurredText bold text={preview.typeName} />
            </View>
            <SectionLabel label="曜日別の歩み(直近3週)" />
            <View style={{ opacity: 0.45 }}>
              <WeekdayBars counts={stats.weekdayCounts} />
            </View>
            <SectionLabel label="止まった後の復帰力" />
            <BlurredText text={comebackText(stats)} />
            <SectionLabel label="来週のホトリの作戦" />
            <BlurredText text={preview.plan} />
          </View>

          <View style={styles.lockArea}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/paywall')}
              style={({ pressed }) => [
                styles.cta,
                { backgroundColor: theme.tint },
                pressed && { opacity: 0.85 },
              ]}>
              <SymbolView name="lock.fill" size={13} tintColor={theme.onTint} />
              <ThemedText type="smallBold" style={{ color: theme.onTint }}>
                手帳を開く
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
              プレミアムで、ホトリの観察がすべて読めます
            </ThemedText>
          </View>
        </Card>

        <PrivacyRow />
      </Screen>
    );
  }

  // ---- プレミアム(データ2週未満): 観察中(デザイン05) ----
  if (schedule.availableWeekNo === 0) {
    const band = maxTimeBand(stats.timeBands);
    return (
      <Screen scroll>
        <NotebookHeader />
        <View style={styles.observing}>
          <Hotori pose="thinking" size={100} animate="thinking" />
          <ThemedText style={styles.observingTitle}>観察中です。</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', lineHeight: 21 }}>
            いま、あなたの歩き方を見ています。{'\n'}最初の手帳は、2週分の記録がそろった日に書き上げます。
          </ThemedText>
          <View style={[styles.countChip, { backgroundColor: theme.tintSoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.tintDeep, fontSize: 12 }}>
              最初の手帳まで あと{schedule.daysToFirst}日
            </ThemedText>
          </View>
        </View>

        <SectionLabel label="ここまでにわかっていること" />
        <View style={styles.timeRow}>
          <View style={[styles.timeCell, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
              歩いた日
            </ThemedText>
            <ThemedText type="smallBold" style={{ fontSize: 16 }}>
              {stats.walkedDays}日
            </ThemedText>
          </View>
          <View style={[styles.timeCell, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
              報告した日
            </ThemedText>
            <ThemedText type="smallBold" style={{ fontSize: 16 }}>
              {stats.zeroReportDays}日
            </ThemedText>
          </View>
          <View
            style={[
              styles.timeCell,
              { borderColor: 'transparent', backgroundColor: theme.tintSoft },
            ]}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
              記録の時間帯
            </ThemedText>
            <ThemedText type="smallBold" style={{ fontSize: 16, color: theme.tintDeep }}>
              {band ? TIME_BAND_LABELS[band] : 'これから'}
            </ThemedText>
          </View>
        </View>

        <PrivacyRow />
      </Screen>
    );
  }

  // ---- プレミアム: 生成中(期間おすすめと同じ「考え中」表現) ----
  if (!cacheMatched || insightCache === null) {
    return (
      <Screen scroll>
        <NotebookHeader />
        <View style={styles.observing}>
          <Hotori pose="thinking" size={100} animate="thinking" />
          <ThemedText style={styles.observingTitle}>手帳をまとめています。</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', lineHeight: 21 }}>
            {stats.observedDays}日分の歩き方を、いま読み返しています。
          </ThemedText>
        </View>
        <PrivacyRow />
      </Screen>
    );
  }

  // ---- プレミアム: 手帳本体(デザイン03) ----
  const insight = insightCache.insight;
  return (
    <Screen scroll>
      <NotebookHeader />
      <View style={styles.metaRow}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
          第{insightCache.weekNo}週の観察
          {schedule.latestFlagDateKey ? ` · ${formatJP(schedule.latestFlagDateKey)}更新` : ''}
        </ThemedText>
        <View style={[styles.countChipSmall, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" style={{ fontSize: 11 }}>
            次の手帳まで あと{schedule.daysToNext}日
          </ThemedText>
        </View>
      </View>

      <LetterCard letter={insight.letter} />

      <SectionLabel label="あなたの歩き方タイプ" />
      <View style={[styles.typeBadge, { backgroundColor: theme.tintSoft }]}>
        <SymbolView name="figure.walk" size={14} tintColor={theme.tintDeep} />
        <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
          {insight.typeName}
        </ThemedText>
      </View>

      <SectionLabel label="曜日別の歩み(直近3週)" />
      <View style={{ gap: Spacing.one }}>
        <WeekdayBars counts={stats.weekdayCounts} showMaxTag />
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 18 }}>
          {insight.weekdayNote}
        </ThemedText>
      </View>

      <SectionLabel label="記録の時間帯" />
      <TimeBandCells stats={stats} />

      <SectionLabel label="止まった後の復帰力" />
      <ComebackCard stats={stats} />

      <SectionLabel label="来週のホトリの作戦" />
      <View style={[styles.planCard, { backgroundColor: theme.tintSoft }]}>
        <ThemedText type="small" style={{ lineHeight: 21 }}>
          {insight.plan}
        </ThemedText>
      </View>

      <PrivacyRow />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, marginTop: Spacing.two },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  premiumTag: { marginLeft: 'auto', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  premiumTagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
  },
  teaser: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  secLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: -Spacing.two },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 1,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 88,
    paddingHorizontal: Spacing.one,
    borderBottomWidth: 1,
    paddingBottom: Spacing.one,
  },
  barCol: { alignItems: 'center', gap: 3, flex: 1 },
  bar: { width: 12, borderRadius: 4 },
  barLabel: { fontSize: 10 },
  maxTag: { fontSize: 9, fontWeight: '800' },
  timeRow: { flexDirection: 'row', gap: Spacing.two },
  timeCell: { flex: 1, borderWidth: 1, borderRadius: 10, padding: Spacing.two + 2, gap: 2 },
  comeback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
  },
  comebackPct: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  letter: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  letterSig: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  planCard: { borderRadius: 12, padding: Spacing.three },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countChip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  countChipSmall: { borderRadius: 999, paddingHorizontal: Spacing.two + 2, paddingVertical: 2 },
  observing: { alignItems: 'center', gap: Spacing.two + 2, paddingTop: Spacing.four },
  observingTitle: { fontSize: 17, fontWeight: '800' },
  lockArea: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.two },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 3,
  },
});
