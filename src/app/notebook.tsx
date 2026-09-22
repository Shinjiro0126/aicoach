import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Hotori } from '@/components/hotori';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { getInsightEntry, listInsightEntries, listReports, upsertInsightEntry } from '@/db/repo';
import type { InsightEntry } from '@/db/schema';
import { generateInsightWithFallback } from '@/lib/ai/client';
import type { InsightRequest } from '@/lib/ai/types';
import { todayKey } from '@/lib/dates';
import {
  buildInsightFallback,
  canReadNotebook,
  computeInsightStats,
  firstReportDateKey,
  insightGenerationPlan,
  isFirstNotebookWeek,
  maxTimeBand,
  notebookSchedule,
  notebookWeekRange,
  TIME_BAND_LABELS,
  WEEKDAY_LABELS,
  type InsightContent,
  type InsightStats,
  type ReportEntry,
} from '@/lib/insight-stats';
import { computeStreak } from '@/lib/streak';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

/**
 * ホトリの観察手帳「たまる手帳」(棚→個別手帳の2層)。
 * - 棚: 執筆中カード+これまでの手帳の一覧(週ラベル・タイプ名・手紙の抜粋)
 * - 個別手帳: 手紙(tintSoft)+統計カード+来週の作戦(sand)。
 *   第1週は「はじめの見立て」版(統計は時間帯+復帰力のみ、曜日リズムは予告カード)
 * - 無料: 1冊目(第1週)は生成・全文閲覧とも無料。2冊目以降は鍵アイコン→ペイウォール
 * 手帳は週ごとに insight_entries(端末内DB)へ綴じられ、サーバーには保存されない。
 */

/** 「9/1」形式(棚の日付範囲用)。週番号・範囲の計算は notebookWeekRange が唯一の起点 */
function formatMD(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}

function NotebookHeader({ onBack, badge }: { onBack: () => void; badge?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="戻る"
        onPress={onBack}
        style={styles.backButton}>
        <SymbolView name="chevron.left" size={20} tintColor={theme.text} weight="semibold" />
      </Pressable>
      <ThemedText style={styles.headerTitle}>観察手帳</ThemedText>
      <View style={{ flex: 1 }} />
      {badge}
    </View>
  );
}

/** プレミアムのピル(棚ヘッダー右) */
function PremiumBadge() {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: theme.tintSoft }]}>
      <ThemedText style={[styles.pillText, { color: theme.tintDeep }]}>プレミアム</ThemedText>
    </View>
  );
}

/** 「最初の手帳」バッジ(第1週)。small は棚の行内用 */
function FirstBadge({ small }: { small?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[small ? styles.pillSmall : styles.pill, { backgroundColor: theme.sand }]}>
      <ThemedText style={[small ? styles.pillTextSmall : styles.pillText, { color: theme.sandText }]}>
        最初の手帳
      </ThemedText>
    </View>
  );
}

function PrivacyRow({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.privacyRow}>
      <SymbolView name="lock.fill" size={11} tintColor={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
        {text}
      </ThemedText>
    </View>
  );
}

/**
 * ぼかしテキスト(ロックされた手帳のプレビュー用)。
 * 文字色を透明にし、影だけをにじませることで「実データが書かれているが読めない」状態を作る
 * (expo-blur を追加せずにテキストだけを判読不能にする)
 */
function BlurredText({ text, bold }: { text: string; bold?: boolean }) {
  const theme = useTheme();
  return (
    <ThemedText
      type={bold ? 'smallBold' : 'small'}
      numberOfLines={1}
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
function WeekdayBars({ counts }: { counts: number[] }) {
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
            {isMax && (
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

/** 記録の時間帯3セル(朝/昼/夜。単独最多を浅瀬ソフトで強調)。フル版の手帳用 */
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

/** はじめの手帳の統計カード: 時間帯(最多バンド+回数) */
function TimeStatCard({ stats }: { stats: InsightStats }) {
  const theme = useTheme();
  const band = maxTimeBand(stats.timeBands);
  return (
    <View style={[styles.statCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.statLabel}>
        時間帯
      </ThemedText>
      <ThemedText style={[styles.statValue, { color: theme.tintDeep }]}>
        {band ? `${TIME_BAND_LABELS[band]} ${stats.timeBands[band]}回` : 'これから'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statCaption}>
        {band ? `${TIME_BAND_LABELS[band]}の一歩が中心です` : '記録が集まると見えてきます'}
      </ThemedText>
    </View>
  );
}

/** はじめの手帳の統計カード: 復帰力(復帰0回は「まだ一度も止まっていません」の既存表現) */
function ComebackStatCard({ stats }: { stats: InsightStats }) {
  const theme = useTheme();
  return (
    <View style={[styles.statCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.statLabel}>
        復帰力
      </ThemedText>
      {stats.stops > 0 ? (
        <>
          <ThemedText style={[styles.statValue, { color: theme.tintDeep }]}>
            翌日復帰 {Math.round((stats.nextDayReturns / stats.stops) * 100)}%
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.statCaption}>
            {stats.nextDayReturns === stats.stops
              ? '止まった翌日に、毎回戻っています'
              : `止まった${stats.stops}回のうち、${stats.nextDayReturns}回は翌日に戻りました`}
          </ThemedText>
        </>
      ) : (
        <>
          {/* 一度も止まっていない場合は文脈のない「0回」を出さず、歩き続けている図像で代える */}
          <SymbolView name="figure.walk" size={24} tintColor={theme.tintDeep} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.statCaption}>
            まだ一度も止まっていません
          </ThemedText>
        </>
      )}
    </View>
  );
}

/** フル版の復帰力カード(分母ゼロは図像+代替文) */
function ComebackCard({ stats }: { stats: InsightStats }) {
  const theme = useTheme();
  return (
    <View style={[styles.comeback, { borderColor: theme.border, backgroundColor: theme.background }]}>
      {stats.stops > 0 ? (
        <ThemedText style={[styles.comebackPct, { color: theme.tint }]}>
          {Math.round((stats.nextDayReturns / stats.stops) * 100)}%
        </ThemedText>
      ) : (
        <SymbolView name="figure.walk" size={26} tintColor={theme.tint} />
      )}
      <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1, lineHeight: 19 }}>
        {stats.stops === 0
          ? 'まだ一度も止まっていません。このまま歩幅を守りましょう。'
          : stats.nextDayReturns === stats.stops
            ? `止まった${stats.stops}回、すべて翌日に戻りました。この復帰力があれば、道のりは途切れません。`
            : `止まった${stats.stops}回のうち、${stats.nextDayReturns}回は翌日に戻りました。戻れた事実が、次の一歩を支えます。`}
      </ThemedText>
    </View>
  );
}

/**
 * 今週の計画の意図(週次リプランの flagMessage)。プレミアムのみ棚に表示する。
 * 内容は端末内の永続キャッシュ(stores/app.ts の replanLetter)から読む
 */
function PlanIntentCard({ weekNo, message }: { weekNo: number; message: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.two }}>
      <SectionLabel label={`今週の計画の意図(第${weekNo}週)`} />
      <View style={[styles.planIntent, { backgroundColor: theme.sand }]}>
        <ThemedText type="small" style={{ color: theme.sandText, lineHeight: 22 }}>
          {message}
        </ThemedText>
        <View style={styles.letterSig}>
          <Hotori variant="bust" size={18} />
          <ThemedText type="small" style={{ color: theme.sandText, fontWeight: '700', fontSize: 12 }}>
            ホトリ
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

/** 個別手帳ビュー(FirstNotebook.dc.html 準拠)。統計はその手帳の旗の日までの記録で組む */
function NotebookDetail({
  entry,
  reports,
  premium,
  onBack,
}: {
  entry: InsightEntry;
  reports: readonly ReportEntry[];
  premium: boolean;
  onBack: () => void;
}) {
  const theme = useTheme();
  const first = isFirstNotebookWeek(entry.weekNo);
  // 過去の手帳を後から開いても内容が変わらないよう、統計はその週の旗の日(toKey)までで固定する
  const scoped = reports.filter((r) => r.dateKey <= entry.toKey);
  const stats = computeInsightStats(
    scoped,
    entry.toKey,
    computeStreak(scoped.map((r) => r.dateKey), entry.toKey),
  );

  return (
    <Screen scroll>
      <NotebookHeader onBack={onBack} badge={first ? <FirstBadge /> : premium ? <PremiumBadge /> : undefined} />

      {/* 手紙カード(浅瀬ソフト) */}
      <View style={[styles.letterCard, { backgroundColor: theme.tintSoft }]}>
        <View style={styles.letterHead}>
          <Hotori variant="bust" size={36} />
          <View style={{ gap: 1 }}>
            <ThemedText type="smallBold" style={{ fontSize: 12, color: theme.tintDeep }}>
              第{entry.weekNo}週の手帳
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
              {formatMD(entry.fromKey)} 〜 {formatMD(entry.toKey)}
              {first ? ' · はじめの見立て' : ''}
            </ThemedText>
          </View>
          <View style={{ flex: 1 }} />
          <View style={[styles.typePill, { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 11, color: theme.tintDeep }}>
              {entry.typeName}
            </ThemedText>
          </View>
        </View>
        <ThemedText type="small" style={{ lineHeight: 26 }}>
          {entry.letter}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, textAlign: 'right' }}>
          — ホトリ
        </ThemedText>
      </View>

      {first ? (
        // ---- はじめの見立て: 統計は時間帯+復帰力のみ。曜日リズムは予告カード ----
        <>
          <View style={styles.statRow}>
            <TimeStatCard stats={stats} />
            <ComebackStatCard stats={stats} />
          </View>
          <View style={[styles.previewCard, { borderColor: theme.tint }]}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 19 }}>
              曜日ごとのリズムは、各曜日を2回ずつ歩いたころ — 次の手帳から見えてきます。
            </ThemedText>
          </View>
        </>
      ) : (
        // ---- 第2週以降: 現行どおりのフル版統計 ----
        <>
          <SectionLabel label="曜日別の歩み(直近3週)" />
          <View style={{ gap: Spacing.one }}>
            <WeekdayBars counts={stats.weekdayCounts} />
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 18 }}>
              {entry.weekdayNote}
            </ThemedText>
          </View>

          <SectionLabel label="記録の時間帯" />
          <TimeBandCells stats={stats} />

          <SectionLabel label="止まった後の復帰力" />
          <ComebackCard stats={stats} />
        </>
      )}

      {/* 来週のホトリの作戦(砂浜サンド) */}
      <View style={[styles.planCard, { backgroundColor: theme.sand }]}>
        <ThemedText style={[styles.planLabel, { color: theme.sandText }]}>来週のホトリの作戦</ThemedText>
        <ThemedText type="small" style={{ color: theme.sandText, lineHeight: 23 }}>
          {entry.plan}
        </ThemedText>
      </View>

      {first && !premium ? (
        // 1冊目無料の読み終わり案内(2冊目以降のプレミアム案内はここに一本化する)
        <View style={[styles.guideBlock, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" style={{ lineHeight: 23 }}>
            最初の手帳は、どなたにも。{'\n'}次の手帳からは、プレミアムでお届けします。
          </ThemedText>
          <Button title="プレミアムを見る" onPress={() => router.push('/paywall')} />
          <PrivacyRow text="この手帳は、この端末の中だけに残ります" />
        </View>
      ) : (
        <PrivacyRow text="この手帳は、この端末の中だけに残ります" />
      )}
    </Screen>
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
  const replanLetter = useAppStore((s) => s.replanLetter);

  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [entries, setEntries] = useState<InsightEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  /** 開いている手帳の週番号(null=棚) */
  const [openWeekNo, setOpenWeekNo] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (!goal) return;
    const rows = listReports(goal.id);
    setReports(rows);
    // 既存ユーザー移行: ストアのinsightキャッシュがDB未保存なら対応週のエントリへ移す。
    // 移行後は「保存済みエントリあり」と判定されるため、同じ週の二重生成は走らない
    const firstKey = firstReportDateKey(rows);
    if (
      firstKey !== null &&
      insightCache !== null &&
      insightCache.goalId === goal.id &&
      insightCache.weekNo >= 1 &&
      getInsightEntry(goal.id, insightCache.weekNo) === undefined
    ) {
      upsertInsightEntry({
        goalId: goal.id,
        weekNo: insightCache.weekNo,
        ...notebookWeekRange(firstKey, insightCache.weekNo),
        letter: insightCache.insight.letter,
        typeName: insightCache.insight.typeName,
        weekdayNote: insightCache.insight.weekdayNote,
        plan: insightCache.insight.plan,
        createdAt: insightCache.generatedAt,
      });
    }
    setEntries(listInsightEntries(goal.id));
    setLoaded(true);
  }, [goal, insightCache]);

  useFocusEffect(refresh);

  const today = todayKey();
  const schedule = notebookSchedule(firstReportDateKey(reports), today);
  // 依存の availableWeekNo は表示ゲートと同じレンダー時計算のため、画面を開いたまま週の
  // 旗の日を跨いだ再レンダーで生成effectも再実行される(Issue #31 と同じ思想)
  const availableWeekNo = schedule.availableWeekNo;

  useEffect(() => {
    if (!goal) return;
    // マウントコミット時点では useFocusEffect(refresh) の setReports がまだ state に反映されて
    // いないため(Issue #29)、生成の判定と集計は state を介さず DB から直接読み直した記録で行う
    const todayNow = todayKey();
    const rows = listReports(goal.id);
    const firstKey = firstReportDateKey(rows);
    const freshSchedule = notebookSchedule(firstKey, todayNow);
    // 無料は1冊目(第1週)のみ生成対象。プレミアムは最新の開放週
    const targetWeek = premium
      ? freshSchedule.availableWeekNo
      : Math.min(freshSchedule.availableWeekNo, 1);
    if (targetWeek === 0 || firstKey === null) return;
    const cacheRef =
      insightCache !== null && insightCache.goalId === goal.id ? insightCache : null;
    const plan = insightGenerationPlan(cacheRef, goal.id, targetWeek);
    if (!plan.generate) return;
    // 保存済みの手帳がある週は新規生成しない(フォールバック保存週の静かな再生成だけ通す)
    if (!plan.retryFallback && getInsightEntry(goal.id, targetWeek) !== undefined) return;
    const key = `${goal.id}:${targetWeek}`;
    if (inFlightInsightKeys.has(key)) return;
    inFlightInsightKeys.add(key);
    const range = notebookWeekRange(firstKey, targetWeek);
    // 過去週の後追い生成(無料の1冊目)は、その週の旗の日までの記録だけで統計を組む
    const isLatest = targetWeek === freshSchedule.availableWeekNo;
    const asOf = isLatest ? todayNow : range.toKey;
    const scopedRows = isLatest ? rows : rows.filter((r) => r.dateKey <= range.toKey);
    const freshStreak = computeStreak(scopedRows.map((r) => r.dateKey), asOf);
    const request: InsightRequest = {
      ...computeInsightStats(scopedRows, asOf, freshStreak),
      weekNo: targetWeek,
      category: goal.category,
    };
    // 失敗・タイムアウトでもフォールバック文で必ず解決する(rejectしない)
    generateInsightWithFallback(request, deviceId).then((result) => {
      inFlightInsightKeys.delete(key);
      // 再生成の試みが再び失敗した場合は、保存済みのフォールバック文を上書きしない
      if (plan.retryFallback && result.fallback) return;
      // 手帳はフォールバック時も端末内DBへ綴じる(棚に必ず1冊残る)
      upsertInsightEntry({
        goalId: goal.id,
        weekNo: targetWeek,
        ...range,
        letter: result.insight.letter,
        typeName: result.insight.typeName,
        weekdayNote: result.insight.weekdayNote,
        plan: result.insight.plan,
      });
      setEntries(listInsightEntries(goal.id));
      setInsight({
        goalId: goal.id,
        weekNo: targetWeek,
        insight: result.insight,
        generatedAt: Date.now(),
        fallback: result.fallback,
      });
    });
  }, [goal, premium, insightCache, deviceId, setInsight, availableWeekNo]);

  if (!goal) return null;

  // フォーカス反映前の空 state で棚を一瞬描画しないよう、読み込み完了まではヘッダーのみ
  if (!loaded) {
    return (
      <Screen scroll>
        <NotebookHeader onBack={() => router.back()} />
      </Screen>
    );
  }

  // ---- 個別手帳ビュー ----
  const openEntry = openWeekNo !== null ? entries.find((e) => e.weekNo === openWeekNo) : undefined;
  if (openEntry && canReadNotebook(premium, openEntry.weekNo)) {
    return (
      <NotebookDetail
        entry={openEntry}
        reports={reports}
        premium={premium}
        onBack={() => setOpenWeekNo(null)}
      />
    );
  }

  // ---- 棚ビュー(Shelf.dc.html) ----
  const planIntent =
    premium && replanLetter !== null && replanLetter.goalId === goal.id ? replanLetter : null;
  const firstKey = firstReportDateKey(reports);
  const latestEntry = entries.find((e) => e.weekNo === availableWeekNo);
  // 最新の開放週がまだ綴じられていない: 読める立場なら「まとめ中」、無料の2冊目以降はロック行
  const generatingLatest =
    availableWeekNo >= 1 && latestEntry === undefined && canReadNotebook(premium, availableWeekNo);
  const lockedLatest =
    availableWeekNo >= 1 &&
    latestEntry === undefined &&
    !canReadNotebook(premium, availableWeekNo) &&
    firstKey !== null;
  const hasShelfRows = entries.length > 0 || lockedLatest;
  const shelfStats = computeInsightStats(
    reports,
    today,
    computeStreak(reports.map((r) => r.dateKey), today),
  );
  // ロック行のぼかしプレビュー用(判読不能のまま「実データが書かれている」感だけ出す)
  const lockedPreview: InsightContent = buildInsightFallback(shelfStats);
  const lockedRange = lockedLatest && firstKey !== null ? notebookWeekRange(firstKey, availableWeekNo) : null;

  return (
    <Screen scroll>
      <NotebookHeader onBack={() => router.back()} badge={premium ? <PremiumBadge /> : undefined} />
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, marginTop: -Spacing.two }}>
        あなたの歩き方の記録。すべてこの端末の中に。
      </ThemedText>

      {/* 執筆中カード(点線枠): いま観察している週 */}
      <View style={[styles.writingCard, { borderColor: theme.tint }]}>
        <Hotori variant="bust" size={40} />
        <View style={{ gap: 2, flex: 1 }}>
          <ThemedText type="smallBold">第{availableWeekNo + 1}週の手帳 · 観察中</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
            旗の日の朝に書き上がります(あと{schedule.daysToNext}日)
          </ThemedText>
        </View>
      </View>

      {planIntent && <PlanIntentCard weekNo={planIntent.weekNo} message={planIntent.message} />}

      {/* 最新の開放週がまだ綴じられていない間の「まとめ中」カード */}
      {generatingLatest && (
        <View style={[styles.writingCard, { borderColor: theme.tint }]}>
          <Hotori pose="thinking" size={40} />
          <View style={{ gap: 2, flex: 1 }}>
            <ThemedText type="smallBold">第{availableWeekNo}週の手帳をまとめています</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
              {shelfStats.observedDays}日分の歩き方を、いま読み返しています。
            </ThemedText>
          </View>
        </View>
      )}

      {hasShelfRows && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.shelfLabel}>
          これまでの手帳
        </ThemedText>
      )}

      {/* 最新週のロック行(無料・2冊目以降)。ぼかしプレビュー+鍵→ペイウォール */}
      {lockedLatest && lockedRange && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`第${availableWeekNo}週の手帳(プレミアム)`}
          onPress={() => router.push('/paywall')}
          style={({ pressed }) => [
            styles.entryRow,
            { borderColor: theme.border },
            pressed && { opacity: 0.85 },
          ]}>
          <View style={styles.entryBody}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
              第{availableWeekNo}週 · {formatMD(lockedRange.fromKey)} 〜 {formatMD(lockedRange.toKey)}
            </ThemedText>
            <View
              style={{ gap: 3 }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <BlurredText bold text={lockedPreview.typeName} />
              <BlurredText text={lockedPreview.letter} />
            </View>
          </View>
          <SymbolView name="lock.fill" size={13} tintColor={theme.textSecondary} />
        </Pressable>
      )}

      {/* これまでの手帳(新しい週順)。無料は1冊目のみ開け、2冊目以降は鍵→ペイウォール */}
      {entries.map((entry) => {
        const readable = canReadNotebook(premium, entry.weekNo);
        return (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={
              readable ? `第${entry.weekNo}週の手帳を開く` : `第${entry.weekNo}週の手帳(プレミアム)`
            }
            onPress={() => (readable ? setOpenWeekNo(entry.weekNo) : router.push('/paywall'))}
            style={({ pressed }) => [
              styles.entryRow,
              { borderColor: theme.border },
              pressed && { opacity: 0.85 },
            ]}>
            <View style={styles.entryBody}>
              <View style={styles.entryMeta}>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                  第{entry.weekNo}週 · {formatMD(entry.fromKey)} 〜 {formatMD(entry.toKey)}
                </ThemedText>
                {isFirstNotebookWeek(entry.weekNo) && <FirstBadge small />}
              </View>
              {readable ? (
                <>
                  <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
                    {entry.typeName}
                  </ThemedText>
                  {/* 抜粋は1行に省略表示(データは省略せず全文をDBに持つ) */}
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={{ fontSize: 12 }}
                    numberOfLines={1}>
                    {entry.letter}
                  </ThemedText>
                </>
              ) : (
                <View
                  style={{ gap: 3 }}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                  <BlurredText bold text={entry.typeName} />
                  <BlurredText text={entry.letter} />
                </View>
              )}
            </View>
            <SymbolView
              name={readable ? 'chevron.right' : 'lock.fill'}
              size={13}
              tintColor={theme.textSecondary}
            />
          </Pressable>
        );
      })}

      {/* 説明カード: タイプ名の変化と卒業の手紙の予告 */}
      <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 19 }}>
          タイプ名の変化は、あなたの歩き方が変わってきた印です。目標を歩き切った日には、ホトリが卒業の手紙をここに綴じます。
        </ThemedText>
      </View>

      <PrivacyRow text="手帳は、この端末の中だけに残ります" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  backButton: {
    width: 44,
    height: 44,
    marginVertical: -10,
    marginLeft: -Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: { borderRadius: 999, paddingHorizontal: Spacing.three - 4, paddingVertical: Spacing.one + 1 },
  pillText: { fontSize: 11, fontWeight: '700' },
  pillSmall: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  pillTextSmall: { fontSize: 10, fontWeight: '700' },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
  },
  writingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: Spacing.three - 2,
  },
  shelfLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: -Spacing.two },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three - 2,
  },
  entryBody: { flex: 1, minWidth: 0, gap: 3 },
  entryMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  infoCard: { borderRadius: 14, padding: Spacing.three - 2 },
  letterCard: { borderRadius: 18, padding: Spacing.three, gap: Spacing.two + 2 },
  letterHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  letterSig: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  typePill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    maxWidth: 160,
  },
  statRow: { flexDirection: 'row', gap: Spacing.two + 2 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 14, padding: Spacing.three - 4, gap: Spacing.one + 2 },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statCaption: { fontSize: 11, lineHeight: 16 },
  previewCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.three - 4,
  },
  planCard: { borderRadius: 14, padding: Spacing.three - 2, gap: Spacing.one + 2 },
  planLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  planIntent: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  guideBlock: { borderRadius: 18, padding: Spacing.three, gap: Spacing.three - 4 },
  secLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: -Spacing.two },
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
});
