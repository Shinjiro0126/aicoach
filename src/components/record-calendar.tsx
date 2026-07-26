import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { addDaysKey, diffDays, monthMeta, shiftMonth } from '@/lib/dates';
import type { ReportEntry } from '@/lib/insight-stats';
import { streakBandDays, type StreakResult } from '@/lib/streak';

/**
 * 統合カレンダーカード(記録タブv2のカレンダー刷新)。
 * 統計3カード・救済メッセージ・カレンダーを1枚のカードに統合し、
 * 月送り(目標開始月〜今月)と「連続の帯」(現在のストリークの可視化)を追加する。
 * デザイン原本: hotori-calendar-v1(統合ステータス帯+浅瀬色の帯+二重リングの今日)
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const CELL_HEIGHT = 44;
const BAND_HEIGHT = 36;
const DAY_SIZE = 33;

export type RecordCalendarProps = {
  /** 全期間の提出記録(repo.listReports の戻り値) */
  reports: readonly ReportEntry[];
  streak: StreakResult;
  /** 歩いた日数(全期間、insight-stats の walkedDays) */
  walkedDays: number;
  /** 目標開始日(YYYY-MM-DD)。月送りの下限は開始月 */
  startKey: string;
  today: string;
};

export function RecordCalendar({ reports, streak, walkedDays, startKey, today }: RecordCalendarProps) {
  const theme = useTheme();
  const scheme = useColorScheme();

  const [todayYear, todayMonth] = today.split('-').map(Number);
  // 表示中の月(初期値は今月)。reports は全期間あるため月切替は表示側だけで完結する
  const [shown, setShown] = useState({ year: todayYear, month: todayMonth });

  // 月送りの範囲: 目標開始月〜今月
  const [startYear, startMonth] = startKey.split('-').map(Number);
  const shownIndex = shown.year * 12 + shown.month;
  const canPrev = shownIndex > startYear * 12 + startMonth;
  const canNext = shownIndex < todayYear * 12 + todayMonth;

  // 日付キー → 提出記録 / 救済日 / 連続の帯(現在のストリークを構成する日)
  const reportMap = new Map(reports.map((r) => [r.dateKey, r.doneCount]));
  const graceSet = new Set(streak.graceUsedOn);
  const bandSet = new Set(
    streakBandDays(
      reports.map((r) => r.dateKey),
      streak.graceUsedOn,
      today,
    ),
  );

  const monthPrefix = `${shown.year}-${String(shown.month).padStart(2, '0')}`;
  // ヘッダー右の月間サマリー: 表示中の月に歩いた日数(チェック1件以上の提出日)
  const monthWalked = reports.filter((r) => r.dateKey.startsWith(monthPrefix) && r.doneCount > 0).length;
  // 表示中の月の救済日(日番号・昇順)
  const graceDaysInMonth = streak.graceUsedOn
    .filter((key) => key.startsWith(monthPrefix))
    .map((key) => Number(key.slice(8)))
    .sort((a, b) => a - b);

  const { firstWeekday, daysInMonth } = monthMeta(shown.year, shown.month);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Card>
      {/* ヘッダー行: 月送り + 月間サマリー */}
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前の月"
          disabled={!canPrev}
          hitSlop={8}
          onPress={() => setShown(shiftMonth(shown.year, shown.month, -1))}
          style={[styles.navBtn, !canPrev && styles.navBtnDisabled]}>
          <SymbolView name="chevron.left" size={14} tintColor={theme.tintDeep} />
        </Pressable>
        <ThemedText type="smallBold">
          {shown.year}年{shown.month}月
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="次の月"
          disabled={!canNext}
          hitSlop={8}
          onPress={() => setShown(shiftMonth(shown.year, shown.month, 1))}
          style={[styles.navBtn, !canNext && styles.navBtnDisabled]}>
          <SymbolView name="chevron.right" size={14} tintColor={theme.tintDeep} />
        </Pressable>
        <View style={styles.spacer} />
        <ThemedText style={[styles.headSub, { color: theme.textSecondary }]}>
          この月は {monthWalked}日 歩きました
        </ThemedText>
      </View>

      {/* 統合ステータス帯: 連続 / 自己ベスト / 歩いた日数(値は全期間) */}
      <View style={[styles.statStrip, { borderColor: theme.border }]}>
        <View style={styles.stat}>
          <View style={styles.statNumRow}>
            <ThemedText style={[styles.statNum, { color: theme.tint }]}>{streak.current}</ThemedText>
            <ThemedText style={[styles.statUnit, { color: theme.textSecondary }]}>日</ThemedText>
          </View>
          <View style={styles.statLabel}>
            <SymbolView name="flame.fill" size={11} tintColor={theme.tint} />
            <ThemedText style={[styles.statLabelText, { color: theme.textSecondary }]}>連続</ThemedText>
          </View>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.stat}>
          <View style={styles.statNumRow}>
            <ThemedText style={styles.statNum}>{streak.best}</ThemedText>
            <ThemedText style={[styles.statUnit, { color: theme.textSecondary }]}>日</ThemedText>
          </View>
          <View style={styles.statLabel}>
            <SymbolView name="trophy" size={11} tintColor={theme.textSecondary} />
            <ThemedText style={[styles.statLabelText, { color: theme.textSecondary }]}>自己ベスト</ThemedText>
          </View>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.stat}>
          <View style={styles.statNumRow}>
            <ThemedText style={styles.statNum}>{walkedDays}</ThemedText>
            <ThemedText style={[styles.statUnit, { color: theme.textSecondary }]}>日</ThemedText>
          </View>
          <View style={styles.statLabel}>
            <SymbolView name="shoeprints.fill" size={11} tintColor={theme.textSecondary} />
            <ThemedText style={[styles.statLabelText, { color: theme.textSecondary }]}>歩いた日数</ThemedText>
          </View>
        </View>
      </View>

      {/* 曜日 */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <ThemedText key={w} type="small" themeColor="textSecondary" style={styles.weekday}>
            {w}
          </ThemedText>
        ))}
      </View>

      {/* グリッド: 歩いた=塗り / 報告のみ=輪郭 / 救済=帯+leaf / 未来=薄い / 今日未提出=破線 */}
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`empty-${i}`} style={styles.cell} />;
          const key = `${monthPrefix}-${String(day).padStart(2, '0')}`;
          const doneCount = reportMap.get(key);
          const walked = doneCount !== undefined && doneCount > 0;
          const reported = doneCount !== undefined && doneCount === 0;
          const grace = doneCount === undefined && graceSet.has(key);
          const isToday = key === today;
          const isFuture = diffDays(today, key) > 0;
          // 連続の帯: 帯の始端・終端だけ丸め、行端をまたいで続く場合はフラット
          const inBand = bandSet.has(key);
          const bandStart = inBand && !bandSet.has(addDaysKey(key, -1));
          const bandEnd = inBand && !bandSet.has(addDaysKey(key, 1));

          const dayCircle = (
            <View
              style={[
                styles.day,
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
                style={[
                  styles.dayText,
                  { color: walked ? theme.onTint : grace ? theme.tintDeep : theme.text },
                  walked && styles.dayTextWalked,
                  grace && styles.dayTextGrace,
                  isFuture && styles.dayTextFuture,
                ]}>
                {day}
              </ThemedText>
              {grace && (
                <SymbolView name="leaf" size={9} tintColor={theme.tintDeep} style={styles.graceLeaf} />
              )}
            </View>
          );

          return (
            <View key={key} style={styles.cell}>
              {inBand && (
                <View
                  style={[
                    styles.band,
                    { backgroundColor: theme.tintSoft },
                    bandStart && styles.bandStart,
                    bandEnd && styles.bandEnd,
                  ]}
                />
              )}
              {isToday && walked ? (
                // 今日(提出済み): 塗り円の外側にカード背景色のギャップ+深瀬ブルーの二重リング
                <View
                  style={[
                    styles.todayRing,
                    { borderColor: theme.tintDeep, backgroundColor: theme.backgroundElement },
                  ]}>
                  {dayCircle}
                </View>
              ) : (
                dayCircle
              )}
            </View>
          );
        })}
      </View>

      {/* 救済メッセージ: 表示中の月に救済日がある場合のみ */}
      {graceDaysInMonth.length > 0 && (
        <View style={styles.graceRow}>
          <SymbolView name="leaf" size={13} tintColor={theme.tint} />
          <ThemedText style={[styles.graceText, { color: theme.textSecondary }]}>
            {graceDaysInMonth.map((d) => `${d}日`).join('・')}は おやすみ。道はつながっています
          </ThemedText>
        </View>
      )}

      {/* 凡例 */}
      <View style={[styles.legend, { borderTopColor: theme.border }]}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: theme.tint }]} />
          <ThemedText style={[styles.legendText, { color: theme.textSecondary }]}>歩いた日</ThemedText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { borderWidth: 1.5, borderColor: theme.tint }]} />
          <ThemedText style={[styles.legendText, { color: theme.textSecondary }]}>報告した日</ThemedText>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.dot,
              { backgroundColor: theme.tintSoft },
              // ダークでは浅瀬ソフトがカード背景に沈むため輪郭を足す(デザイン原本と同じ扱い)
              scheme === 'dark' && { borderWidth: 1, borderColor: theme.border },
            ]}
          />
          <ThemedText style={[styles.legendText, { color: theme.textSecondary }]}>おやすみ</ThemedText>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendTodayRing,
              { borderColor: theme.tintDeep, backgroundColor: theme.backgroundElement },
            ]}>
            <View style={[styles.legendTodayDot, { backgroundColor: theme.tint }]} />
          </View>
          <ThemedText style={[styles.legendText, { color: theme.textSecondary }]}>今日</ThemedText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  navBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.3 },
  spacer: { flex: 1 },
  headSub: { fontSize: 11, lineHeight: 16 },

  statStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.two + 2,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth * 2 },
  statNumRow: { flexDirection: 'row', alignItems: 'baseline' },
  statNum: { fontSize: 20, lineHeight: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 11, lineHeight: 14, fontWeight: '700', marginLeft: 1 },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statLabelText: { fontSize: 10, lineHeight: 14, fontWeight: '600' },

  weekRow: { flexDirection: 'row' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (CELL_HEIGHT - BAND_HEIGHT) / 2,
    height: BAND_HEIGHT,
  },
  bandStart: { left: 5, borderTopLeftRadius: 999, borderBottomLeftRadius: 999 },
  bandEnd: { right: 5, borderTopRightRadius: 999, borderBottomRightRadius: 999 },
  day: { width: DAY_SIZE, height: DAY_SIZE, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  dayTextWalked: { fontWeight: '700' },
  dayTextGrace: { fontWeight: '600' },
  dayTextFuture: { opacity: 0.35 },
  graceLeaf: { position: 'absolute', top: -3, right: -1 },
  todayRing: { borderRadius: 999, borderWidth: 2, padding: 2 },

  graceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, paddingHorizontal: Spacing.one },
  graceText: { fontSize: 11, lineHeight: 16 },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three - 2,
    borderTopWidth: 1,
    paddingTop: Spacing.two + 2,
    paddingHorizontal: Spacing.one,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 12, height: 12, borderRadius: 999 },
  legendText: { fontSize: 10, lineHeight: 14 },
  legendTodayRing: { borderRadius: 999, borderWidth: 1.5, padding: 1.5 },
  legendTodayDot: { width: 8, height: 8, borderRadius: 999 },
});
