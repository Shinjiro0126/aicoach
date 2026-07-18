import { and, asc, desc, eq } from 'drizzle-orm';

import { makeId } from '@/lib/id';
import { db, sqlite } from './client';
import {
  checkins,
  coachMessages,
  dailyActions,
  dailyReports,
  dailyTasks,
  goals,
  weeklyPlans,
  type Checkin,
  type CoachMessage,
  type DailyAction,
  type DailyReport,
  type DailyTask,
  type Goal,
  type WeeklyPlan,
} from './schema';

// ---- Goals ----

export function getActiveGoal(): Goal | undefined {
  return db.select().from(goals).where(eq(goals.status, 'active')).limit(1).all()[0];
}

export function createGoal(input: {
  title: string;
  why: string;
  category?: string;
  targetDate?: string;
  /** 現在地ヒアリングの回答({question, answer}[] のJSON文字列) */
  hearingAnswers?: string;
}): Goal {
  const goal: Goal = {
    id: makeId(),
    title: input.title,
    why: input.why,
    category: input.category ?? 'other',
    targetDate: input.targetDate ?? null,
    hearingAnswers: input.hearingAnswers ?? null,
    status: 'active',
    createdAt: Date.now(),
  };
  db.insert(goals).values(goal).run();
  return goal;
}

export function archiveGoal(goalId: string): void {
  db.update(goals).set({ status: 'archived' }).where(eq(goals.id, goalId)).run();
}

// ---- Weekly plans / daily actions ----

export function insertWeeklyPlans(goalId: string, focuses: string[]): WeeklyPlan[] {
  const rows: WeeklyPlan[] = focuses.map((focus, i) => ({
    id: makeId(),
    goalId,
    weekNo: i + 1,
    focus,
    createdAt: Date.now(),
  }));
  for (const row of rows) db.insert(weeklyPlans).values(row).run();
  return rows;
}

export function getWeeklyPlans(goalId: string): WeeklyPlan[] {
  return db
    .select()
    .from(weeklyPlans)
    .where(eq(weeklyPlans.goalId, goalId))
    .orderBy(asc(weeklyPlans.weekNo))
    .all();
}

export function insertDailyActions(
  goalId: string,
  actions: { date: string; description: string }[],
): void {
  for (const a of actions) {
    db.insert(dailyActions)
      .values({ id: makeId(), goalId, date: a.date, description: a.description, done: false, doneAt: null })
      .run();
  }
}

export function getActionForDate(goalId: string, date: string): DailyAction | undefined {
  return db
    .select()
    .from(dailyActions)
    .where(and(eq(dailyActions.goalId, goalId), eq(dailyActions.date, date)))
    .limit(1)
    .all()[0];
}

export function upsertActionForDate(goalId: string, date: string, description: string): DailyAction {
  const existing = getActionForDate(goalId, date);
  if (existing) {
    db.update(dailyActions).set({ description }).where(eq(dailyActions.id, existing.id)).run();
    return { ...existing, description };
  }
  const row: DailyAction = { id: makeId(), goalId, date, description, done: false, doneAt: null };
  db.insert(dailyActions).values(row).run();
  return row;
}

/** 最後に登録された行動(8日目以降に「昨日と同じ行動」を提案するために使う) */
export function getLatestAction(goalId: string): DailyAction | undefined {
  return db
    .select()
    .from(dailyActions)
    .where(eq(dailyActions.goalId, goalId))
    .orderBy(desc(dailyActions.date))
    .limit(1)
    .all()[0];
}

export function setActionDone(actionId: string, done: boolean): void {
  db.update(dailyActions)
    .set({ done, doneAt: done ? Date.now() : null })
    .where(eq(dailyActions.id, actionId))
    .run();
}

/** 達成済みの日付キー一覧(ストリーク・カレンダー用) */
export function listDoneDates(goalId: string): string[] {
  return db
    .select({ date: dailyActions.date })
    .from(dailyActions)
    .where(and(eq(dailyActions.goalId, goalId), eq(dailyActions.done, true)))
    .all()
    .map((r) => r.date);
}

/** 直近n日の達成状況(コーチのコンテキスト用) */
export function recentActionSummary(goalId: string, dates: string[]): { date: string; done: boolean; description: string }[] {
  return dates.map((date) => {
    const action = getActionForDate(goalId, date);
    return { date, done: action?.done ?? false, description: action?.description ?? '' };
  });
}

// ---- Daily tasks(ホームv2: 今日の一歩+プラスワン)----

export function getTasksForDate(goalId: string, dateKey: string): DailyTask[] {
  return db
    .select()
    .from(dailyTasks)
    .where(and(eq(dailyTasks.goalId, goalId), eq(dailyTasks.dateKey, dateKey)))
    .orderBy(asc(dailyTasks.sortOrder), asc(dailyTasks.createdAt))
    .all();
}

/**
 * 今日のタスクが未生成なら、既存の計画データから生成する。
 * - 今日の一歩(main): 当日の daily_actions → なければ直近の行動を引き継ぐ → 最後は目標名から組み立てる
 * - プラスワン(plus)2件: 今週のフォーカステーマから1件+振り返りの記録1件
 */
export function ensureTasksForDate(
  goalId: string,
  dateKey: string,
  opts: { goalTitle: string; weekFocus?: string },
): DailyTask[] {
  const existing = getTasksForDate(goalId, dateKey);
  if (existing.length > 0) return existing;

  const todayAction = getActionForDate(goalId, dateKey);
  const action = todayAction ?? getLatestAction(goalId);
  const mainTitle = action?.description ?? `「${opts.goalTitle}」のために10分取り組む`;
  // 当日の daily_actions が達成済みなら done を引き継ぐ。
  // v4マイグレーションは達成済み daily_actions を当日分も含めて daily_reports にバックフィルするため、
  // ここで引き継がないと「提出済み(done_count=1)なのに全行未チェック」という矛盾表示になる。
  // getLatestAction による過去日からのフォールバック時は引き継がない(今日はまだ達成していないため)
  const mainDone = todayAction?.done ?? false;
  const plusTitles = [
    opts.weekFocus
      ? `「${opts.weekFocus}」を意識して、もう5分だけ進める`
      : '今日の一歩を、もう5分だけ続ける',
    '今日の気づきをひとことメモする',
  ];

  const now = Date.now();
  const rows: DailyTask[] = [
    { id: makeId(), goalId, dateKey, title: mainTitle, kind: 'main', done: mainDone, sortOrder: 0, createdAt: now },
    ...plusTitles.map<DailyTask>((title, i) => ({
      id: makeId(),
      goalId,
      dateKey,
      title,
      kind: 'plus',
      done: false,
      sortOrder: i + 1,
      createdAt: now,
    })),
  ];
  for (const row of rows) db.insert(dailyTasks).values(row).run();
  return rows;
}

/** ユーザー追加タスク(kind='custom')。タイトルは端末内にのみ保存される */
export function addCustomTask(goalId: string, dateKey: string, title: string): DailyTask {
  const last = getTasksForDate(goalId, dateKey).at(-1);
  const row: DailyTask = {
    id: makeId(),
    goalId,
    dateKey,
    title,
    kind: 'custom',
    done: false,
    sortOrder: (last?.sortOrder ?? -1) + 1,
    createdAt: Date.now(),
  };
  db.insert(dailyTasks).values(row).run();
  return row;
}

/** ユーザー追加タスク(kind='custom')のみ削除する。計画由来の main / plus は削除できない */
export function deleteCustomTask(taskId: string): void {
  const task = db.select().from(dailyTasks).where(eq(dailyTasks.id, taskId)).limit(1).all()[0];
  if (!task || task.kind !== 'custom') return;
  db.delete(dailyTasks).where(eq(dailyTasks.id, taskId)).run();
}

/**
 * タスクのチェック切替。今日の一歩(main)は旧 daily_actions にも反映し、
 * コーチのコンテキスト(直近7日の達成状況)と互換を保つ
 */
export function setTaskDone(taskId: string, done: boolean): void {
  const task = db.select().from(dailyTasks).where(eq(dailyTasks.id, taskId)).limit(1).all()[0];
  if (!task) return;
  db.update(dailyTasks).set({ done }).where(eq(dailyTasks.id, taskId)).run();
  if (task.kind === 'main') {
    const action = upsertActionForDate(task.goalId, task.dateKey, task.title);
    setActionDone(action.id, done);
  }
}

// ---- Daily reports(日次の提出記録)----

export function getReportForDate(goalId: string, dateKey: string): DailyReport | undefined {
  return db
    .select()
    .from(dailyReports)
    .where(and(eq(dailyReports.goalId, goalId), eq(dailyReports.dateKey, dateKey)))
    .limit(1)
    .all()[0];
}

/**
 * その日の記録を提出する。チェック0件でも提出でき、提出=その日の記録として扱う
 * (ストリークは提出日で数える)。すでに提出済みなら件数だけ更新する
 */
export function submitReport(goalId: string, dateKey: string): DailyReport {
  const tasks = getTasksForDate(goalId, dateKey);
  const doneCount = tasks.filter((t) => t.done).length;
  const existing = getReportForDate(goalId, dateKey);
  if (existing) {
    const updated = { ...existing, doneCount, totalCount: tasks.length };
    db.update(dailyReports)
      .set({ doneCount, totalCount: tasks.length })
      .where(eq(dailyReports.id, existing.id))
      .run();
    return updated;
  }
  const row: DailyReport = {
    id: makeId(),
    goalId,
    dateKey,
    submittedAt: Date.now(),
    doneCount,
    totalCount: tasks.length,
  };
  db.insert(dailyReports).values(row).run();
  return row;
}

/** 提出後にチェックを追記した際の件数更新(未提出日は何もしない) */
export function refreshReportCounts(goalId: string, dateKey: string): void {
  if (getReportForDate(goalId, dateKey)) submitReport(goalId, dateKey);
}

/** 提出済みの日付キー一覧(ストリーク・カレンダー用)。提出=その日の記録 */
export function listReportDates(goalId: string): string[] {
  return db
    .select({ dateKey: dailyReports.dateKey })
    .from(dailyReports)
    .where(eq(dailyReports.goalId, goalId))
    .all()
    .map((r) => r.dateKey);
}

// ---- Checkins ----

export function addCheckin(goalId: string, date: string, mood: number | null, note: string | null): Checkin {
  const row: Checkin = { id: makeId(), goalId, date, mood, note, createdAt: Date.now() };
  db.insert(checkins).values(row).run();
  return row;
}

export function getCheckin(goalId: string, date: string): Checkin | undefined {
  return db
    .select()
    .from(checkins)
    .where(and(eq(checkins.goalId, goalId), eq(checkins.date, date)))
    .limit(1)
    .all()[0];
}

// ---- Coach messages ----

export function addCoachMessage(goalId: string, role: 'user' | 'assistant', content: string): CoachMessage {
  const row: CoachMessage = { id: makeId(), goalId, role, content, createdAt: Date.now() };
  db.insert(coachMessages).values(row).run();
  return row;
}

export function listCoachMessages(goalId: string, limit = 100): CoachMessage[] {
  return db
    .select()
    .from(coachMessages)
    .where(eq(coachMessages.goalId, goalId))
    .orderBy(desc(coachMessages.createdAt))
    .limit(limit)
    .all()
    .reverse();
}

// ---- Data management (設定画面: エクスポート / 全削除) ----

export function exportAllData(): string {
  const data = {
    exportedAt: new Date().toISOString(),
    goals: db.select().from(goals).all(),
    weeklyPlans: db.select().from(weeklyPlans).all(),
    dailyActions: db.select().from(dailyActions).all(),
    dailyTasks: db.select().from(dailyTasks).all(),
    dailyReports: db.select().from(dailyReports).all(),
    checkins: db.select().from(checkins).all(),
    coachMessages: db.select().from(coachMessages).all(),
  };
  return JSON.stringify(data, null, 2);
}

export function deleteAllData(): void {
  sqlite.withTransactionSync(() => {
    sqlite.execSync(
      'DELETE FROM coach_messages; DELETE FROM checkins; DELETE FROM daily_reports; DELETE FROM daily_tasks; DELETE FROM daily_actions; DELETE FROM weekly_plans; DELETE FROM goals;',
    );
  });
}
