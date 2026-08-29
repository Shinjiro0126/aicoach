import { addDaysKey } from '../dates';
import {
  buildFlagWeekSummary,
  buildNextWeekPreview,
  flagDayNotificationWeekday,
  weekStartNotificationWeekday,
} from '../flag-day';
import type { JourneyDay, JourneyDayState } from '../insight-stats';

/** 週7日分の JourneyDay をテスト用に組み立てる */
function week(states: JourneyDayState[]): JourneyDay[] {
  return states.map((state, i) => ({
    dateKey: addDaysKey('2026-07-01', i),
    state,
    isToday: i === states.length - 1,
  }));
}

describe('buildFlagWeekSummary', () => {
  it('歩いた・報告した・おやすみの3種がそろう週(提案書の例)', () => {
    const days = week(['walked', 'walked', 'reported', 'grace', 'walked', 'walked', 'walked']);
    expect(buildFlagWeekSummary(days)).toBe(
      'この7日で、歩いた日が5日、報告した日が1日、おやすみが1日。できなかった日も、道のうちです。',
    );
  });

  it('0件の項目は文から省く(歩いた日のみ+抜けあり)', () => {
    const days = week(['walked', 'walked', 'missed', 'walked', 'walked', 'walked', 'walked']);
    expect(buildFlagWeekSummary(days)).toBe(
      'この7日で、歩いた日が6日。できなかった日も、道のうちです。',
    );
  });

  it('報告した日とおやすみだけの週も、その2項目だけで組む', () => {
    const days = week(['reported', 'grace', 'missed', 'missed', 'reported', 'missed', 'reported']);
    expect(buildFlagWeekSummary(days)).toBe(
      'この7日で、報告した日が3日、おやすみが1日。できなかった日も、道のうちです。',
    );
  });

  it('7日すべて歩いた週は「できなかった日」の文を出さない', () => {
    const days = week(['walked', 'walked', 'walked', 'walked', 'walked', 'walked', 'walked']);
    expect(buildFlagWeekSummary(days)).toBe(
      'この7日で、歩いた日が7日。7日すべてを、自分の足で歩き切りました。',
    );
  });

  it('記録が1件も無い週は防御的なフォールバック文(実運用では提出直後のため発生しない)', () => {
    const days = week(['missed', 'missed', 'missed', 'missed', 'missed', 'missed', 'missed']);
    expect(buildFlagWeekSummary(days)).toBe(
      'この7日の記録はまだありません。次の7日を、いまの歩幅で歩きましょう。',
    );
  });
});

describe('buildNextWeekPreview', () => {
  it('次週フォーカスがあれば「道を整えた」予告を出す', () => {
    expect(buildNextWeekPreview(2, true)).toBe(
      '第3週の道を整えておきました。明日の朝、最初の石で待っています。',
    );
  });

  it('次週フォーカスが無い(第4週の旗以降)は実現できない約束をしない文に差し替える', () => {
    expect(buildNextWeekPreview(4, false)).toBe('明日も、この道の続きで待っています。');
  });
});

describe('flagDayNotificationWeekday', () => {
  // expo-notifications の weekday は 1=日曜〜7=土曜。
  // 旗の日=開始日+6日(2026-07-01 は水曜)
  it.each([
    ['2026-07-01', 3], // 水曜開始 → 旗の日は火曜(3)
    ['2026-07-02', 4], // 木曜開始 → 水曜(4)
    ['2026-07-03', 5], // 金曜開始 → 木曜(5)
    ['2026-07-04', 6], // 土曜開始 → 金曜(6)
    ['2026-07-05', 7], // 日曜開始 → 土曜(7)
    ['2026-07-06', 1], // 月曜開始 → 日曜(1)
    ['2026-07-07', 2], // 火曜開始 → 月曜(2)
  ])('開始日 %s の旗の日通知は weekday=%d', (startKey, expected) => {
    expect(flagDayNotificationWeekday(startKey)).toBe(expected);
  });
});

describe('weekStartNotificationWeekday', () => {
  it.each([
    ['2026-07-01', 4], // 水曜開始 → 週初日も水曜(4)
    ['2026-07-05', 1], // 日曜開始 → 日曜(1)
    ['2026-07-04', 7], // 土曜開始 → 土曜(7)
  ])('開始日 %s の手帳通知(週初日)は weekday=%d', (startKey, expected) => {
    expect(weekStartNotificationWeekday(startKey)).toBe(expected);
  });

  it('週初日は旗の日の翌日に当たる(weekdayが常に1つ先)', () => {
    for (const startKey of ['2026-07-01', '2026-07-05', '2026-07-06', '2026-07-07']) {
      const flag = flagDayNotificationWeekday(startKey);
      expect(weekStartNotificationWeekday(startKey)).toBe((flag % 7) + 1);
    }
  });
});
