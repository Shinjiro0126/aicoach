import {
  ALL_NOTIFICATION_IDS,
  buildNotificationPlans,
  EVENING_ID,
  FLAG_ID,
  MORNING_ID,
  NOTEBOOK_ID,
  notebookNotificationTime,
} from '../notification-plan';

// 2026-07-01 は水曜(WEEKLYトリガーの weekday は 1=日曜〜7=土曜 なので 4)
const START = '2026-07-01';
const MORNING = { hour: 8, minute: 0 };
const EVENING = { hour: 21, minute: 30 };

describe('notebookNotificationTime', () => {
  it('朝リマインドの30分後にする(同時刻に2本重ねない)', () => {
    expect(notebookNotificationTime({ hour: 8, minute: 0 })).toEqual({ hour: 8, minute: 30 });
  });

  it('分が繰り上がる場合は時へ繰り越す', () => {
    expect(notebookNotificationTime({ hour: 9, minute: 45 })).toEqual({ hour: 10, minute: 15 });
  });

  it('23時台は0時台へ丸める(防御的)', () => {
    expect(notebookNotificationTime({ hour: 23, minute: 45 })).toEqual({ hour: 0, minute: 15 });
  });
});

describe('buildNotificationPlans(手帳通知のプレミアム分岐)', () => {
  it('無料ユーザーは朝・夜・旗の日の3本のみ(手帳通知は含まれない)', () => {
    const plans = buildNotificationPlans('英語を話せるようになる', MORNING, EVENING, START, false);
    expect(plans.map((p) => p.identifier)).toEqual([MORNING_ID, EVENING_ID, FLAG_ID]);
  });

  it('プレミアムは手帳更新通知が加わる(週初日の朝・朝リマインドの30分後)', () => {
    const plans = buildNotificationPlans('英語を話せるようになる', MORNING, EVENING, START, true);
    const notebook = plans.find((p) => p.identifier === NOTEBOOK_ID);
    expect(notebook).toEqual({
      identifier: NOTEBOOK_ID,
      title: '観察手帳を書き終えました',
      body: 'あなたの1週間の見立てが、手帳にあります。',
      // 週初日=旗の日(開始日+6日)の翌日=開始日と同じ曜日(水曜=4)
      trigger: { type: 'weekly', weekday: 4, hour: 8, minute: 30 },
    });
  });

  it('旗の日通知は開始日+6日の曜日・昼12:00(既存2通知と衝突しない)', () => {
    const plans = buildNotificationPlans('目標', MORNING, EVENING, START, true);
    const flag = plans.find((p) => p.identifier === FLAG_ID);
    // 2026-07-07 は火曜(=3)
    expect(flag?.trigger).toEqual({ type: 'weekly', weekday: 3, hour: 12, minute: 0 });
  });

  it('解除経路: 生成しうる全通知IDが ALL_NOTIFICATION_IDS に含まれる(プレミアムOFF・通知OFF・目標リセットで確実に消せる)', () => {
    const plans = buildNotificationPlans('目標', MORNING, EVENING, START, true);
    for (const plan of plans) {
      expect(ALL_NOTIFICATION_IDS).toContain(plan.identifier);
    }
  });
});
