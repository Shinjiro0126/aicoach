import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Celebration } from '@/components/celebration';
import { Hotori } from '@/components/hotori';
import { ProgressCard } from '@/components/progress-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import {
  addCustomTask,
  ensureTasksForDate,
  getActionForDate,
  getReportForDate,
  getWeeklyPlans,
  listReportDates,
  refreshReportCounts,
  setTaskDone,
  submitReport,
} from '@/db/repo';
import type { DailyReport, DailyTask } from '@/db/schema';
import { AnalyticsEvent, trackEvent } from '@/lib/analytics/posthog';
import { addDaysKey, formatJP, toDateKey, todayKey } from '@/lib/dates';
import { progressSummary, weekFlagInfo, weekSegments } from '@/lib/progress';
import { addWeeksKey, currentWeekNo, ROADMAP_WEEKS } from '@/lib/roadmap';
import { computeStreak } from '@/lib/streak';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

/** タスクの種別ラベル(デザイン01のt-label) */
const KIND_LABELS: Record<DailyTask['kind'], string> = {
  main: '最小行動',
  plus: '今週のテーマから',
  custom: '自分で追加',
};

/** チェック可能なタスク1行(今日の一歩はtint枠線で強調) */
function TaskRow({ task, onToggle }: { task: DailyTask; onToggle: () => void }) {
  const theme = useTheme();
  const isMain = task.kind === 'main';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: task.done }}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.task,
        isMain
          ? { backgroundColor: theme.background, borderWidth: 1.5, borderColor: theme.tint }
          : { backgroundColor: theme.backgroundElement },
        pressed && { opacity: 0.85 },
      ]}>
      <View
        style={[
          styles.cbox,
          task.done
            ? { backgroundColor: theme.tint, borderColor: theme.tint }
            : { borderColor: theme.backgroundSelected },
        ]}>
        {task.done && <SymbolView name="checkmark" size={14} tintColor={theme.onTint} weight="bold" />}
      </View>
      <View style={styles.taskBody}>
        <ThemedText
          type="small"
          style={{ fontSize: 11, fontWeight: '700', color: isMain ? theme.tintDeep : theme.textSecondary }}>
          {KIND_LABELS[task.kind]}
        </ThemedText>
        <ThemedText
          style={
            task.done
              ? { color: theme.textSecondary, textDecorationLine: 'line-through' }
              : undefined
          }>
          {task.title}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** 提出内容プレビューの1行(確認シート・提出後サマリーで共用) */
function ReportRow({ task, onToggle }: { task: DailyTask; onToggle?: () => void }) {
  const theme = useTheme();
  const inner = (
    <>
      <SymbolView
        name={task.done ? 'checkmark.circle.fill' : 'circle'}
        size={18}
        tintColor={task.done ? theme.tint : theme.textSecondary}
      />
      <ThemedText
        type="small"
        style={{ flex: 1, color: task.done ? theme.text : theme.textSecondary }}>
        {task.title}
      </ThemedText>
    </>
  );
  if (!onToggle) return <View style={styles.reportRow}>{inner}</View>;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: task.done }}
      onPress={onToggle}
      style={({ pressed }) => [styles.reportRow, pressed && { opacity: 0.7 }]}>
      {inner}
    </Pressable>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const goal = useAppStore((s) => s.activeGoal);

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [reportDates, setReportDates] = useState<string[]>([]);
  const [streak, setStreak] = useState({ current: 0, best: 0 });
  const [sheetVisible, setSheetVisible] = useState(false);
  const [celebrating, setCelebrating] = useState<{ streak: number; isBest: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [customTitle, setCustomTitle] = useState('');

  const today = todayKey();

  const refresh = useCallback(() => {
    if (!goal) return;
    const planList = getWeeklyPlans(goal.id);
    const startKey = toDateKey(new Date(goal.createdAt));
    const weekNo = currentWeekNo(startKey, today, planList.length || ROADMAP_WEEKS);
    setTasks(
      ensureTasksForDate(goal.id, today, {
        goalTitle: goal.title,
        weekFocus: planList[weekNo - 1]?.focus,
      }),
    );
    setReport(getReportForDate(goal.id, today) ?? null);
    const dates = listReportDates(goal.id);
    setReportDates(dates);
    const result = computeStreak(dates, today);
    setStreak({ current: result.current, best: result.best });
  }, [goal, today]);

  useFocusEffect(refresh);

  if (!goal) return null;

  const startKey = toDateKey(new Date(goal.createdAt));
  const targetKey = goal.targetDate ?? addWeeksKey(startKey, 13);
  const summary = progressSummary(startKey, targetKey, today);
  const week = weekFlagInfo(startKey, today, reportDates);
  const segments = weekSegments(startKey, targetKey, today);
  const submitted = report !== null;

  const mainTask = tasks.find((t) => t.kind === 'main');
  const extraTasks = tasks.filter((t) => t.kind !== 'main');
  const checkedCount = tasks.filter((t) => t.done).length;

  const toggleTask = (task: DailyTask) => {
    setTaskDone(task.id, !task.done);
    // 提出後の追記でも件数は最新に保つ(再演出はしない)
    if (submitted) refreshReportCounts(goal.id, today);
    refresh();
  };

  const confirmAddTask = () => {
    const title = customTitle.trim();
    if (title.length > 0) addCustomTask(goal.id, today, title);
    setCustomTitle('');
    setAdding(false);
    refresh();
  };

  const submit = () => {
    const prevBest = streak.best;
    submitReport(goal.id, today);
    const dates = listReportDates(goal.id);
    const result = computeStreak(dates, today);
    // 連続日数(数値)のみ送信する。タスク名などの自由テキストは送らない
    trackEvent(AnalyticsEvent.StreakAchieved, { streakCount: result.current });
    setSheetVisible(false);
    setCelebrating({ streak: result.current, isBest: result.current > prevBest });
    refresh();
  };

  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは';

  // ---- 祝い演出(提出直後の全画面)----
  if (celebrating) {
    return (
      <Screen withTabInset>
        <Celebration
          streak={celebrating.streak}
          isBest={celebrating.isBest}
          week={week}
          segments={segments}
          copyMain={summary.copyMain}
          copySub={summary.copySub}
          onListen={() => {
            setCelebrating(null);
            router.push({ pathname: '/coach', params: { autoReport: today } });
          }}
          onClose={() => setCelebrating(null)}
        />
      </Screen>
    );
  }

  // ---- 提出後のホーム(同日再訪。チェック追記可・再演出なし)----
  if (submitted) {
    const restDays = week.daysToFlag - 1;
    const tomorrowAction = getActionForDate(goal.id, addDaysKey(today, 1));
    return (
      <Screen scroll withTabInset>
        <View style={styles.header}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatJP(today)}
          </ThemedText>
          <ThemedText type="subtitle">{goal.title}</ThemedText>
        </View>

        <View style={styles.doneHero}>
          <Hotori pose="applaud" size={110} animate={reduceMotion ? undefined : 'idle'} />
          <ThemedText style={styles.doneTitle}>今日の分、受け取りました</ThemedText>
          <View style={[styles.streakUp, { backgroundColor: theme.tintSoft }]}>
            <SymbolView name="flame.fill" size={14} tintColor={theme.tintDeep} />
            <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
              {streak.current}日連続になりました
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {restDays > 0 ? `第${week.weekNo}週の旗まで、あと${restDays}日。` : `第${week.weekNo}週の旗に、たどり着きました。`}
            {'\n'}ここまで続く人は多くありません。
          </ThemedText>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            今日の記録 {checkedCount}/{tasks.length}
          </ThemedText>
          {tasks.map((task) => (
            <ReportRow key={task.id} task={task} onToggle={() => toggleTask(task)} />
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            今日中なら、チェックを追記できます
          </ThemedText>
        </View>

        <ProgressCard week={week} segments={segments} copyMain={summary.copyMain} copySub={summary.copySub} />

        <View style={[styles.tomorrowCard, { backgroundColor: theme.sand }]}>
          <ThemedText type="small" style={{ fontWeight: '700', color: theme.sandText }}>
            明日の一歩(予告)
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.sandText, lineHeight: 21 }}>
            {tomorrowAction
              ? `明日は「${tomorrowAction.description}」から始めます。起きたらまずこの画面を開いてください。`
              : '明日も、今日と同じ歩幅で十分です。起きたらまずこの画面を開いてください。'}
          </ThemedText>
        </View>
      </Screen>
    );
  }

  // ---- 朝のホーム(未提出)----
  return (
    <>
      <Screen scroll withTabInset>
        <View style={styles.header}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatJP(today)}
          </ThemedText>
          <ThemedText type="subtitle">{goal.title}</ThemedText>
          <View style={styles.streakRow}>
            <View style={styles.streakBadge}>
              <SymbolView name="flame.fill" size={16} tintColor={theme.tintDeep} />
              <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
                {streak.current}日連続
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              ベスト {streak.best}日
            </ThemedText>
          </View>
        </View>

        <View style={[styles.kickoff, { backgroundColor: theme.tintSoft }]}>
          <Hotori pose="normal" size={52} animate={reduceMotion ? undefined : 'idle'} />
          <View style={styles.kickoffBody}>
            <ThemedText type="small" style={{ lineHeight: 22 }}>
              {greeting}。{summary.elapsedDays}日目の今日は、
              <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
                「{goal.why}」への一歩
              </ThemedText>
              を積む日です。
            </ThemedText>
            <View style={[styles.flagCount, { backgroundColor: theme.background }]}>
              <SymbolView name="flag.fill" size={12} tintColor={theme.tintDeep} />
              <ThemedText type="small" style={{ fontSize: 12, fontWeight: '700', color: theme.tintDeep }}>
                第{week.weekNo}週の旗まで、あと{week.daysToFlag}日
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.secHead}>
          <ThemedText type="smallBold">今日の一歩</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            これだけで今日は合格
          </ThemedText>
        </View>
        {mainTask && <TaskRow task={mainTask} onToggle={() => toggleTask(mainTask)} />}

        <View style={styles.secHead}>
          <ThemedText type="smallBold">プラスワン</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            やる気が乗った日だけでいい
          </ThemedText>
        </View>
        {extraTasks.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task)} />
        ))}

        {adding ? (
          <View style={[styles.addInputRow, { borderColor: theme.backgroundSelected }]}>
            <TextInput
              value={customTitle}
              onChangeText={setCustomTitle}
              placeholder="自分のタスクを入力"
              placeholderTextColor={theme.textSecondary}
              style={[styles.addInput, { color: theme.text }]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmAddTask}
            />
            <Pressable accessibilityRole="button" onPress={confirmAddTask} hitSlop={8}>
              <SymbolView name="checkmark.circle.fill" size={24} tintColor={theme.tint} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setAdding(true)}
            style={({ pressed }) => [
              styles.addRow,
              { borderColor: theme.backgroundSelected },
              pressed && { opacity: 0.7 },
            ]}>
            <SymbolView name="plus" size={14} tintColor={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={{ fontWeight: '600' }}>
              自分のタスクを追加
            </ThemedText>
          </Pressable>
        )}

        <ProgressCard week={week} segments={segments} copyMain={summary.copyMain} copySub={summary.copySub} />

        <View style={styles.bottomArea}>
          <Button
            title={checkedCount > 0 ? `今日の記録をホトリに見せる(${checkedCount}件)` : '今日の記録をホトリに見せる'}
            onPress={() => setSheetVisible(true)}
          />
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {checkedCount > 0
              ? 'できなかった分があっても大丈夫。ホトリは責めません'
              : 'チェックがなくても提出できます。動けなかった日の報告も、大切な記録です'}
          </ThemedText>
        </View>
      </Screen>

      {/* 提出確認シート(誤タップしても戻れる) */}
      <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetDim} onPress={() => setSheetVisible(false)} />
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <View style={[styles.grab, { backgroundColor: theme.backgroundSelected }]} />
            <ThemedText style={styles.sheetTitle}>今日の記録を見せますか?</ThemedText>
            {tasks.map((task) => (
              <ReportRow key={task.id} task={task} />
            ))}
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              提出したあとも、今日中ならチェックを追記できます
            </ThemedText>
            <Button title="見せる" onPress={submit} />
            <Button title="まだ見せない" variant="ghost" onPress={() => setSheetVisible(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.one, marginTop: Spacing.two },
  streakRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  kickoff: {
    borderRadius: 16,
    padding: Spacing.three,
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  kickoffBody: { flex: 1, gap: Spacing.two },
  flagCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: Spacing.two + 1,
    paddingVertical: 3,
  },
  secHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: -Spacing.two,
  },
  task: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, borderRadius: 16, padding: Spacing.three },
  cbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskBody: { flex: 1, gap: 2 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  addInput: { flex: 1, fontSize: 15, minHeight: 40 },
  bottomArea: { gap: Spacing.two, marginTop: Spacing.two },
  doneHero: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.two },
  doneTitle: { fontSize: 18, fontWeight: '700' },
  streakUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 10,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.one + 2,
  },
  summaryCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tomorrowCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,18,24,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two + 2,
  },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
});
