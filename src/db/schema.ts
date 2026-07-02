import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** 目標。MVPではアクティブな目標は同時に1つ */
export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** なぜ達成したいか(コーチのコンテキストに使う) */
  why: text('why').notNull().default(''),
  targetDate: text('target_date'),
  status: text('status', { enum: ['active', 'archived', 'done'] })
    .notNull()
    .default('active'),
  createdAt: integer('created_at').notNull(),
});

/** AIが生成した週ごとのフォーカステーマ */
export const weeklyPlans = sqliteTable('weekly_plans', {
  id: text('id').primaryKey(),
  goalId: text('goal_id').notNull(),
  weekNo: integer('week_no').notNull(),
  focus: text('focus').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** 毎日の最小行動。date は端末ローカルの YYYY-MM-DD */
export const dailyActions = sqliteTable('daily_actions', {
  id: text('id').primaryKey(),
  goalId: text('goal_id').notNull(),
  date: text('date').notNull(),
  description: text('description').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  doneAt: integer('done_at'),
});

/** 夜の振り返り記録 */
export const checkins = sqliteTable('checkins', {
  id: text('id').primaryKey(),
  goalId: text('goal_id').notNull(),
  date: text('date').notNull(),
  /** 1(つらい)〜5(絶好調) */
  mood: integer('mood'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
});

/** コーチ対話履歴 */
export const coachMessages = sqliteTable('coach_messages', {
  id: text('id').primaryKey(),
  goalId: text('goal_id').notNull(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type Goal = typeof goals.$inferSelect;
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type DailyAction = typeof dailyActions.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type CoachMessage = typeof coachMessages.$inferSelect;
