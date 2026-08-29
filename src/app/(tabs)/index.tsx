import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Celebration } from '@/components/celebration';
import { FlagCelebration } from '@/components/flag-celebration';
import { Hotori } from '@/components/hotori';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import {
  addCustomTask,
  applyWeeklyReplan,
  deleteCustomTask,
  ensureTasksForDate,
  getActionForDate,
  getReportForDate,
  getWeeklyPlans,
  listActionsInRange,
  listReportDates,
  listReports,
  refreshReportCounts,
  setTaskDone,
  submitReport,
} from '@/db/repo';
import type { DailyReport, DailyTask } from '@/db/schema';
import { replanWeek } from '@/lib/ai/client';
import type { ReplanRequest } from '@/lib/ai/types';
import { AnalyticsEvent, trackEvent } from '@/lib/analytics/posthog';
import { addDaysKey, diffDays, formatJP, toDateKey, todayKey } from '@/lib/dates';
import { buildFlagWeekSummary, buildNextWeekPreview } from '@/lib/flag-day';
import { buildTeaser, coldStartJourneyDays, computeInsightStats } from '@/lib/insight-stats';
import { effectivePace, type NextWeekPace } from '@/lib/pace';
import {
  buildReplanStats,
  collectPrevActions,
  normalizeReplanActions,
  replanActionsToDates,
  shouldReplanNextWeek,
  weekDateRange,
} from '@/lib/replan';
import { isFlagDay, progressSummary, weekFlagInfo, weekSegments } from '@/lib/progress';
import { addWeeksKey, currentWeekNo, ROADMAP_WEEKS, weekIndex } from '@/lib/roadmap';
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

/** チェック可能なタスク1行(今日の一歩はtint枠線で強調)。custom タスクは長押しで削除できる */
function TaskRow({ task, onToggle, onDelete }: { task: DailyTask; onToggle: () => void; onDelete?: () => void }) {
  const theme = useTheme();
  const isMain = task.kind === 'main';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: task.done }}
      accessibilityHint={onDelete ? '長押しで削除できます' : undefined}
      onPress={onToggle}
      onLongPress={onDelete}
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

/** 旗の日セレモニーの表示データ(提出時に純関数で組み立てて渡す) */
type FlagCeremonyData = {
  weekNo: number;
  summaryText: string;
  teaserText: string;
  previewText: string;
  /**
   * 週次リプランのリクエスト(pace はセレモニーの歩幅宣言で確定してから発火時に上書き)。
   * 次週分の週次プランが既にある週(1週1回ガード)は null
   */
  replan: ReplanRequest | null;
};

/**
 * リプラン発火ガード(goalId:週番号)。閉じるボタンの二度押し等で同じ週に
 * 二重発火しないよう、モジュールスコープに置く(notebook の inFlightInsightKeys と同じ方針)。
 * 週を跨いだ再実行の要否は DB 側の1週1回ガード(shouldReplanNextWeek)が判定する
 */
const firedReplanKeys = new Set<string>();

/**
 * 週次リプランの実行(fire-and-forget)。セレモニーを閉じる裏で走らせる。
 * - 成功: 次週フォーカス+7日分の行動を保存し、flagMessage をストアへ(週1回・無料。対話クォータは消費しない)
 * - 失敗・オフライン・応答不備: 何もしない=既存の前日コピーにフォールバックし、UIにエラーを出さない
 */
async function runWeeklyReplan(req: ReplanRequest, goalId: string, startKey: string, deviceId: string): Promise<void> {
  const key = `${goalId}:${req.nextWeekNo}`;
  if (firedReplanKeys.has(key)) return;
  firedReplanKeys.add(key);
  try {
    const res = await replanWeek(req, deviceId);
    const focus = res.nextWeekFocus?.trim();
    const actions = replanActionsToDates(startKey, normalizeReplanActions(req.nextWeekNo, res.dailyActions ?? []));
    if (!focus || actions.length === 0) {
      trackEvent(AnalyticsEvent.WeeklyReplanGenerated, { weekNo: req.nextWeekNo, fallback: true });
      return;
    }
    applyWeeklyReplan(goalId, req.nextWeekNo, focus, actions);
    // 「なぜこの計画にしたか」の手紙はプレミアムのみ観察手帳に表示する(保存は端末内のみ)
    if (res.flagMessage?.trim()) {
      useAppStore.getState().setReplanLetter({
        goalId,
        weekNo: req.nextWeekNo,
        message: res.flagMessage.trim(),
        generatedAt: Date.now(),
      });
    }
    trackEvent(AnalyticsEvent.WeeklyReplanGenerated, { weekNo: req.nextWeekNo, fallback: false });
  } catch {
    trackEvent(AnalyticsEvent.WeeklyReplanGenerated, { weekNo: req.nextWeekNo, fallback: true });
  }
}

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const goal = useAppStore((s) => s.activeGoal);
  const nextWeekPace = useAppStore((s) => s.nextWeekPace);
  const setNextWeekPace = useAppStore((s) => s.setNextWeekPace);
  const premium = useAppStore((s) => s.premium);
  const deviceId = useAppStore((s) => s.deviceId);

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [reportDates, setReportDates] = useState<string[]>([]);
  const [streak, setStreak] = useState({ current: 0, best: 0 });
  const [sheetVisible, setSheetVisible] = useState(false);
  const [celebrating, setCelebrating] = useState<{
    streak: number;
    isBest: boolean;
    flag: FlagCeremonyData | null;
  } | null>(null);
  const [adding, setAdding] = useState(false);
  const [customTitle, setCustomTitle] = useState('');

  const today = todayKey();

  const refresh = useCallback(() => {
    if (!goal) return;
    const planList = getWeeklyPlans(goal.id);
    const startKey = toDateKey(new Date(goal.createdAt));
    const weekNo = currentWeekNo(startKey, today, planList.length || ROADMAP_WEEKS);
    // 歩幅宣言(旗の日の3択)は宣言時の goalId・forWeekNo が現在の目標・実週番号(クランプなし)と
    // 一致する週だけ効く(目標リセット後の新目標に旧宣言を漏らさない)
    const rawWeekNo = weekIndex(startKey, today) + 1;
    setTasks(
      ensureTasksForDate(goal.id, today, {
        goalTitle: goal.title,
        weekFocus: planList[weekNo - 1]?.focus,
        pace: effectivePace(nextWeekPace, goal.id, rawWeekNo),
      }),
    );
    setReport(getReportForDate(goal.id, today) ?? null);
    const dates = listReportDates(goal.id);
    setReportDates(dates);
    const result = computeStreak(dates, today);
    setStreak({ current: result.current, best: result.best });
  }, [goal, today, nextWeekPace]);

  useFocusEffect(refresh);

  if (!goal) return null;

  const startKey = toDateKey(new Date(goal.createdAt));
  const targetKey = goal.targetDate ?? addWeeksKey(startKey, 13);
  const summary = progressSummary(startKey, targetKey, today);
  const week = weekFlagInfo(startKey, today, reportDates);
  const segments = weekSegments(startKey, targetKey, today);
  const submitted = report !== null;
  // 旗の日判定はここに一本化(提出後コピー・セレモニー分岐で共用)
  const flagToday = isFlagDay(startKey, today);

  const mainTask = tasks.find((t) => t.kind === 'main');
  const extraTasks = tasks.filter((t) => t.kind !== 'main');
  const checkedCount = tasks.filter((t) => t.done).length;

  const toggleTask = (task: DailyTask) => {
    setTaskDone(task.id, !task.done);
    // 提出後の追記でも件数は最新に保つ(再演出はしない)
    if (submitted) refreshReportCounts(goal.id, today);
    refresh();
  };

  /** custom タスクの削除(長押し→確認)。誤入力タイトルが一日中残らないようにする */
  const removeCustomTask = (task: DailyTask) => {
    Alert.alert('このタスクを削除しますか?', `「${task.title}」を今日のリストから外します。`, [
      { text: 'やめる', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: () => {
          deleteCustomTask(task.id);
          if (submitted) refreshReportCounts(goal.id, today);
          refresh();
        },
      },
    ]);
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
    // 連続日数・達成件数(いずれも数値)のみ送信する。タスク名などの自由テキストは送らない。
    // v2から発火タイミングが「達成」でなく「提出」になったため、doneCount で0件提出と達成を区別できるようにする
    trackEvent(AnalyticsEvent.StreakAchieved, { streakCount: result.current, doneCount: checkedCount });
    setSheetVisible(false);
    // 「自己ベスト更新」は2日連続以上で初めて出す(初提出の1日連続で出すと演出の重みが薄れるため)。
    // 祝いは全画面Modal: 確認シート(Modal)の閉じ処理と表示が競合しないよう、閉じ切ってから開く
    // (デザイン00「提出→0.5秒で祝い演出」の間にもなる)
    const isBest = result.current > prevBest && result.current > 1;

    // 旗の日(週の7日目)は通常の祝いの代わりに旗の日セレモニーを開く。
    // 週まとめ・観察は端末内集計のみ(AI呼び出しなし)。週の窓は
    // coldStartJourneyDays(週アライン計算と同じ週境界)を共有する。
    // 期日到達後(summary.reached)は提出後コピーと同じく到達を最優先し、
    // 週番号が増え続けるセレモニーは開かず通常の祝いへフォールバックする(D-2 終端体験までの暫定)
    let flag: FlagCeremonyData | null = null;
    if (flagToday && !summary.reached) {
      const weekNow = weekFlagInfo(startKey, today, dates);
      trackEvent(AnalyticsEvent.FlagDayReached, {
        weekNo: weekNow.weekNo,
        weekDoneCount: weekNow.doneCount,
      });
      const reports = listReports(goal.id);
      const weekDays = coldStartJourneyDays(startKey, reports, result.graceUsedOn, today);
      const planList = getWeeklyPlans(goal.id);
      const nextWeekNo = weekNow.weekNo + 1;
      const nextFocus = planList.find((p) => p.weekNo === nextWeekNo)?.focus;

      // 週次リプラン(B-1)の入力を提出時点の最新データで組み立てる。
      // 1週1回ガード: 次週分の週次プランが既にあればスキップ(replan: null)。
      // プライバシー: 送るのは目標名・動機・カテゴリ・AI生成系 daily_actions の文言・数値統計のみ。
      // customタスク・会話・ヒアリング回答は送らない(collectPrevActions が防御的に除外)
      let replan: ReplanRequest | null = null;
      if (shouldReplanNextWeek(planList.map((p) => p.weekNo), nextWeekNo)) {
        const range = weekDateRange(startKey, weekNow.weekNo);
        replan = {
          goalTitle: goal.title,
          why: goal.why,
          category: goal.category,
          nextWeekNo,
          prevFocus: planList.find((p) => p.weekNo === weekNow.weekNo)?.focus ?? '',
          prevActions: collectPrevActions(listActionsInRange(goal.id, range.fromKey, range.toKey), range),
          stats: buildReplanStats(weekDays, result.current),
          // pace はセレモニーの歩幅宣言で確定してから発火時に上書きする
          pace: 'keep',
          totalWeeks: Math.max(1, Math.round(diffDays(startKey, targetKey) / 7)),
        };
      }

      flag = {
        weekNo: weekNow.weekNo,
        summaryText: buildFlagWeekSummary(weekDays),
        teaserText: buildTeaser(computeInsightStats(reports, today, result)),
        previewText: buildNextWeekPreview(weekNow.weekNo, nextFocus !== undefined),
        replan,
      };
    }
    setTimeout(() => setCelebrating({ streak: result.current, isBest, flag }), 450);
    refresh();
  };

  /**
   * セレモニー・祝い演出を閉じる(旗の日は完走計測つき)。
   * 旗の日は閉じる裏で週次リプラン(B-1)を fire-and-forget で発火する。
   * 歩幅宣言が確定するのは閉じる瞬間のため、発火はここに一本化する
   * (celebrating が null になるのはこの1回だけなので二重発火しない)
   */
  const closeCelebration = (action: 'pace_selected' | 'closed' = 'closed', pace: NextWeekPace = 'keep') => {
    if (celebrating?.flag) {
      trackEvent(AnalyticsEvent.FlagCeremonyClosed, { weekNo: celebrating.flag.weekNo, action });
      if (celebrating.flag.replan) {
        runWeeklyReplan({ ...celebrating.flag.replan, pace }, goal.id, startKey, deviceId);
      }
    }
    setCelebrating(null);
  };

  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは';

  // ---- 祝い演出(提出直後)----
  // デザイン03はタブバー非表示の全画面演出のため、タブ内表示でなくフルスクリーンModalで重ねる。
  // 旗の日は通常の Celebration の代わりに FlagCelebration(週の締めセレモニー)を出す
  const flagData = celebrating?.flag ?? null;
  const celebrationModal = (
    <Modal
      visible={celebrating !== null}
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={() => closeCelebration()}>
      <View
        style={[
          styles.celebrationRoot,
          {
            backgroundColor: theme.background,
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom + Spacing.two,
          },
        ]}>
        {celebrating &&
          (flagData ? (
            <FlagCelebration
              weekNo={flagData.weekNo}
              summaryText={flagData.summaryText}
              teaserText={flagData.teaserText}
              previewText={flagData.previewText}
              premium={premium}
              onSelectPace={(pace) => {
                // 宣言が効くのは現在の目標の翌週のみ(goalId・forWeekNo でスコープ)
                setNextWeekPace({ goalId: goal.id, pace, forWeekNo: flagData.weekNo + 1 });
                trackEvent(AnalyticsEvent.NextWeekPaceSelected, { pace });
                // 宣言した歩幅はリプランのプロンプト入力にもなる(閉じる裏で発火)
                closeCelebration('pace_selected', pace);
              }}
              onOpenNotebook={() => {
                // 手帳導線(C-3・プレミアム)。閉じ経路は closeCelebration() に一本化
                trackEvent(AnalyticsEvent.NotebookOpened, {
                  weekNo: flagData.weekNo,
                  premium: true,
                  from: 'ceremony',
                });
                closeCelebration();
                router.push('/notebook');
              }}
              onOpenPaywall={() => {
                // 手帳導線(C-3・無料)。ペイウォール表示の計測は paywall.tsx 側の PaywallViewed
                closeCelebration();
                router.push('/paywall');
              }}
              onClose={() => closeCelebration()}
            />
          ) : (
            <Celebration
              streak={celebrating.streak}
              isBest={celebrating.isBest}
              week={week}
              segments={segments}
              copyMain={summary.copyMain}
              copySub={summary.copySub}
              onListen={() => {
                // 閉じ経路は closeCelebration() に一本化(将来 flag 付きで開いても計測が漏れないように)
                closeCelebration();
                router.push({ pathname: '/coach', params: { autoReport: today } });
              }}
              onClose={() => closeCelebration()}
            />
          ))}
      </View>
    </Modal>
  );

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
            {/* 期日到達後は週の旗でなくゴール到達を語る(「第N週の旗まで」が増え続けないように)。
                旗の日判定はセレモニーと同じ isFlagDay に一本化 */}
            {summary.reached
              ? 'ゴールまで、歩き切りました。'
              : flagToday
                ? `第${week.weekNo}週の旗に、たどり着きました。`
                : `第${week.weekNo}週の旗まで、あと${restDays}日。`}
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

        {/* ジャーニーカードは祝い演出(週1回のご褒美)専用。ホームには常時表示しない(デザイン原本00-⑤/06) */}
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

        {celebrationModal}
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
          {/* デザイン01の朝ひとことは円形・水辺グラデのアバター(bust) */}
          <Hotori variant="bust" size={40} />
          <View style={styles.kickoffBody}>
            <ThemedText type="small" style={{ lineHeight: 22 }}>
              {/* 週初日(第2週以降)は fresh start の朝ひとことに切り替える(B-2) */}
              {week.dayIndex === 0 && week.weekNo >= 2 && !summary.reached ? (
                <>
                  {greeting}。今日から第{week.weekNo}週です。
                  {'まっさらな7日を、いまの歩幅で歩きましょう。'}
                </>
              ) : (
                <>
                  {greeting}。{summary.elapsedDays}日目の今日は、
                  <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
                    「{goal.why}」への一歩
                  </ThemedText>
                  を積む日です。
                </>
              )}
            </ThemedText>
            <View style={[styles.flagCount, { backgroundColor: theme.background }]}>
              <SymbolView name="flag.fill" size={12} tintColor={theme.tintDeep} />
              <ThemedText type="small" style={{ fontSize: 12, fontWeight: '700', color: theme.tintDeep }}>
                {/* 期日到達後は週の旗でなくゴール到達を語る。
                    「あとn日」は記録タブ・提出後ホームと同じ「今日より後」の数え方に統一し、
                    旗の日(残り0日)は日数でなく旗の日そのものを告げる(Issue #42) */}
                {summary.reached
                  ? 'ゴールまで、歩き切りました'
                  : flagToday
                    ? `今日は、第${week.weekNo}週の旗の日`
                    : `第${week.weekNo}週の旗まで、あと${week.daysToFlag - 1}日`}
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
          <TaskRow
            key={task.id}
            task={task}
            onToggle={() => toggleTask(task)}
            onDelete={task.kind === 'custom' ? () => removeCustomTask(task) : undefined}
          />
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

        {/* ジャーニーカードは祝い演出(週1回のご褒美)専用。朝ホームには常時表示しない(デザイン原本00-⑤/01) */}
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

      {celebrationModal}
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
  celebrationRoot: { flex: 1, paddingHorizontal: Spacing.three },
});
