import { and, asc, desc, eq } from 'drizzle-orm';

import { makeId } from '@/lib/id';
import { db, sqlite } from './client';
import {
  checkins,
  coachMessages,
  dailyActions,
  goals,
  weeklyPlans,
  type Checkin,
  type CoachMessage,
  type DailyAction,
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
    checkins: db.select().from(checkins).all(),
    coachMessages: db.select().from(coachMessages).all(),
  };
  return JSON.stringify(data, null, 2);
}

export function deleteAllData(): void {
  sqlite.withTransactionSync(() => {
    sqlite.execSync(
      'DELETE FROM coach_messages; DELETE FROM checkins; DELETE FROM daily_actions; DELETE FROM weekly_plans; DELETE FROM goals;',
    );
  });
}
