/**
 * データエクスポートの整形純関数(`src/db/repo.ts` の exportAllData から使う)。
 *
 * 「記録のみ」モードでは、共有先に渡ると差し支えのある自由テキスト
 * (対話履歴 coachMessages・ヒアリング回答 hearingAnswers・振り返りメモ note)を除外し、
 * 行動記録・数値データだけのJSONにする。除外の判断はすべてこのファイルに集約する。
 */

/** エクスポートJSONのスキーマ版数(将来のインポート機能での互換性判定用) */
export const EXPORT_SCHEMA_VERSION = 1;

type Row = Record<string, unknown>;

/** エクスポート対象の全テーブル(repo が読み出した行をそのまま渡す) */
export type ExportTables = {
  goals: readonly Row[];
  goalMilestones: readonly Row[];
  weeklyPlans: readonly Row[];
  dailyActions: readonly Row[];
  dailyTasks: readonly Row[];
  dailyReports: readonly Row[];
  checkins: readonly Row[];
  coachMessages: readonly Row[];
};

/** 行から指定キーを除いた浅いコピーを返す(元の行は変更しない) */
function omitKeys(row: Row, keys: readonly string[]): Row {
  const copy: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (!keys.includes(key)) copy[key] = value;
  }
  return copy;
}

/**
 * エクスポートJSONのルートオブジェクトを組み立てる。
 * - includeConversations=false(記録のみ): coachMessages を含めず、
 *   goals から hearingAnswers、checkins から note を除く(mood などの数値は残す)
 * - includeConversations=true(すべて): 全テーブルをそのまま含める
 * どちらも schemaVersion / exportedAt をルートに持つ
 */
export function buildExportPayload(
  tables: ExportTables,
  opts: { includeConversations: boolean; exportedAt: string },
): Row {
  const base = { schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt: opts.exportedAt };
  if (opts.includeConversations) {
    return {
      ...base,
      goals: [...tables.goals],
      goalMilestones: [...tables.goalMilestones],
      weeklyPlans: [...tables.weeklyPlans],
      dailyActions: [...tables.dailyActions],
      dailyTasks: [...tables.dailyTasks],
      dailyReports: [...tables.dailyReports],
      checkins: [...tables.checkins],
      coachMessages: [...tables.coachMessages],
    };
  }
  return {
    ...base,
    goals: tables.goals.map((row) => omitKeys(row, ['hearingAnswers'])),
    goalMilestones: [...tables.goalMilestones],
    weeklyPlans: [...tables.weeklyPlans],
    dailyActions: [...tables.dailyActions],
    dailyTasks: [...tables.dailyTasks],
    dailyReports: [...tables.dailyReports],
    checkins: tables.checkins.map((row) => omitKeys(row, ['note'])),
    // coachMessages(対話履歴)は「記録のみ」には含めない
  };
}
