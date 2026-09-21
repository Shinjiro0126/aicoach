import { buildExportPayload, EXPORT_SCHEMA_VERSION, type ExportTables } from '../export';

/** テスト用の全テーブル(自由テキストには判別しやすい目印を入れる) */
function makeTables(): ExportTables {
  return {
    goals: [
      {
        id: 'g1',
        title: '毎朝ランニングする',
        why: '健康のため',
        category: 'health',
        targetDate: '2026-12-31',
        hearingAnswers: '[{"question":"今の状況は?","answer":"HEARING_SECRET"}]',
        status: 'active',
        createdAt: 100,
      },
    ],
    goalMilestones: [{ id: 'm1', goalId: 'g1', fromWeek: 1, toWeek: 2, title: '基礎づくり', sortNo: 0 }],
    weeklyPlans: [{ id: 'w1', goalId: 'g1', weekNo: 1, focus: '習慣化', createdAt: 100 }],
    dailyActions: [
      { id: 'a1', goalId: 'g1', date: '2026-09-01', description: '10分走る', done: true, doneAt: 200 },
    ],
    dailyTasks: [
      {
        id: 't1',
        goalId: 'g1',
        dateKey: '2026-09-01',
        title: '10分走る',
        kind: 'main',
        done: true,
        sortOrder: 0,
        createdAt: 100,
      },
    ],
    dailyReports: [
      { id: 'r1', goalId: 'g1', dateKey: '2026-09-01', submittedAt: 300, doneCount: 1, totalCount: 3 },
    ],
    checkins: [
      { id: 'c1', goalId: 'g1', date: '2026-09-01', mood: 4, note: 'NOTE_SECRET', createdAt: 400 },
    ],
    coachMessages: [{ id: 'cm1', goalId: 'g1', role: 'user', content: 'CHAT_SECRET', createdAt: 500 }],
  };
}

const EXPORTED_AT = '2026-09-21T00:00:00.000Z';

describe('buildExportPayload(記録のみ)', () => {
  const payload = buildExportPayload(makeTables(), {
    includeConversations: false,
    exportedAt: EXPORTED_AT,
  });

  it('ルートに schemaVersion と exportedAt を含む', () => {
    expect(payload.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(payload.exportedAt).toBe(EXPORTED_AT);
  });

  it('coachMessages(対話履歴)を含まない', () => {
    expect(payload).not.toHaveProperty('coachMessages');
  });

  it('goals から hearingAnswers を除外し、他のフィールドは残す', () => {
    const goal = (payload.goals as Record<string, unknown>[])[0];
    expect(goal).not.toHaveProperty('hearingAnswers');
    expect(goal.title).toBe('毎朝ランニングする');
    expect(goal.why).toBe('健康のため');
  });

  it('checkins から note を除外し、mood は残す', () => {
    const checkin = (payload.checkins as Record<string, unknown>[])[0];
    expect(checkin).not.toHaveProperty('note');
    expect(checkin.mood).toBe(4);
    expect(checkin.date).toBe('2026-09-01');
  });

  it('JSON全文にも自由テキスト(対話・ヒアリング・メモ)が一切現れない', () => {
    const json = JSON.stringify(payload);
    expect(json).not.toContain('CHAT_SECRET');
    expect(json).not.toContain('HEARING_SECRET');
    expect(json).not.toContain('NOTE_SECRET');
  });

  it('記録系テーブル(milestones/plans/actions/tasks/reports)はそのまま含む', () => {
    expect(payload.goalMilestones).toHaveLength(1);
    expect(payload.weeklyPlans).toHaveLength(1);
    expect(payload.dailyActions).toHaveLength(1);
    expect(payload.dailyTasks).toHaveLength(1);
    expect(payload.dailyReports).toHaveLength(1);
  });

  it('入力の行オブジェクトを変更しない(非破壊)', () => {
    const tables = makeTables();
    buildExportPayload(tables, { includeConversations: false, exportedAt: EXPORTED_AT });
    expect(tables.goals[0].hearingAnswers).toContain('HEARING_SECRET');
    expect(tables.checkins[0].note).toBe('NOTE_SECRET');
  });
});

describe('buildExportPayload(すべて)', () => {
  const payload = buildExportPayload(makeTables(), {
    includeConversations: true,
    exportedAt: EXPORTED_AT,
  });

  it('ルートに schemaVersion と exportedAt を含む', () => {
    expect(payload.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(payload.exportedAt).toBe(EXPORTED_AT);
  });

  it('coachMessages・hearingAnswers・note を含む(現状のフルエクスポート互換)', () => {
    expect(payload.coachMessages).toHaveLength(1);
    const goal = (payload.goals as Record<string, unknown>[])[0];
    const checkin = (payload.checkins as Record<string, unknown>[])[0];
    expect(goal.hearingAnswers).toContain('HEARING_SECRET');
    expect(checkin.note).toBe('NOTE_SECRET');
  });
});
