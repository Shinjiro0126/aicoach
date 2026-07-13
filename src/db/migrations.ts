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
