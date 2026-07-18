import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** 目標。MVPではアクティブな目標は同時に1つ */
export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** なぜ達成したいか(コーチのコンテキストに使う) */
  why: text('why').notNull().default(''),
  /** 目標カテゴリ(src/constants/categories.ts の GoalCategory) */
  category: text('category').notNull().default('other'),
  /** 達成期日(YYYY-MM-DD、null許容) */
  targetDate: text('target_date'),
  /** 現在地ヒアリングの回答({question, answer}[] のJSON文字列、null許容)。端末内にのみ保存 */
  hearingAnswers: text('hearing_answers'),
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

/**
 * デイリータスク(ホームv2)。dateKey は端末ローカルの YYYY-MM-DD。
 * kind: main=今日の一歩(必須1件) / plus=プラスワン / custom=ユーザー追加
 */
export const dailyTasks = sqliteTable('daily_tasks', {
  id: text('id').primaryKey(),
  goalId: text('goal_id').notNull(),
  dateKey: text('date_key').notNull(),
  title: text('title').notNull(),
  kind: text('kind', { enum: ['main', 'plus', 'custom'] })
    .notNull()
    .default('main'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

/**
 * 日次の提出記録。「その日提出済みか」を表し、ストリークは提出日で数える。
 * 提出後も今日中はチェックを追記でき、その際は done_count / total_count を更新する
 */
export const dailyReports = sqliteTable('daily_reports', {
  id: text('id').primaryKey(),
  goalId: text('goal_id').notNull(),
  dateKey: text('date_key').notNull(),
  submittedAt: integer('submitted_at').notNull(),
  doneCount: integer('done_count').notNull().default(0),
  totalCount: integer('total_count').notNull().default(0),
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
export type DailyTask = typeof dailyTasks.$inferSelect;
export type DailyReport = typeof dailyReports.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type CoachMessage = typeof coachMessages.$inferSelect;
