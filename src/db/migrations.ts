import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * 手書きマイグレーション。PRAGMA user_version で適用済みバージョンを管理する。
 * スキーマ変更時は配列の末尾に追加すること(既存要素は変更しない)。
 */
const MIGRATIONS: string[] = [
  // v1: 初期スキーマ
  `
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    why TEXT NOT NULL DEFAULT '',
    target_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS weekly_plans (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL,
    week_no INTEGER NOT NULL,
    focus TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_actions (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    done_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_daily_actions_goal_date ON daily_actions (goal_id, date);
  CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL,
    date TEXT NOT NULL,
    mood INTEGER,
    note TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS coach_messages (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_coach_messages_goal ON coach_messages (goal_id, created_at);
  `,
  // v2: 目標カテゴリを追加(target_date は v1 で作成済み)
  `
  ALTER TABLE goals ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
  `,
  // v3: 現在地ヒアリングの回答(質問と回答のペア配列のJSON文字列)。端末内にのみ保存する
  `
  ALTER TABLE goals ADD COLUMN hearing_answers TEXT;
  `,
  // v4: ホームv2 — デイリータスク(今日の一歩+プラスワン+ユーザー追加)と日次提出記録。
  // 提出(daily_reports)が「その日の記録」の単位になり、ストリークは提出日で数える。
  // 既存の達成済み daily_actions は提出記録として引き継ぐ(ストリークを切らさないため)
  `
  CREATE TABLE IF NOT EXISTS daily_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'main',
    done INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_daily_tasks_goal_date ON daily_tasks (goal_id, date_key);
  CREATE TABLE IF NOT EXISTS daily_reports (
    id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    submitted_at INTEGER NOT NULL,
    done_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reports_goal_date ON daily_reports (goal_id, date_key);
  INSERT INTO daily_reports (id, goal_id, date_key, submitted_at, done_count, total_count)
    SELECT lower(hex(randomblob(16))), goal_id, date, COALESCE(MAX(done_at), 0), 1, 1
    FROM daily_actions WHERE done = 1 GROUP BY goal_id, date;
  `,
];

export function runMigrations(db: SQLiteDatabase): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[v]);
      db.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
