import { addDaysKey } from '../dates';
import type { JourneyDay, JourneyDayState } from '../insight-stats';
import {
  buildReplanStats,
  collectPrevActions,
  normalizeReplanActions,
  replanActionsToDates,
  shouldReplanNextWeek,
  weekDateRange,
} from '../replan';

const START = '2026-07-01';

/** 週7日分の JourneyDay をテスト用に組み立てる */
function week(states: JourneyDayState[]): JourneyDay[] {
  return states.map((state, i) => ({
    dateKey: addDaysKey(START, i),
    state,
    isToday: i === states.length - 1,
  }));
}

describe('weekDateRange', () => {
  it('第1週は開始日〜6日後', () => {
    expect(weekDateRange(START, 1)).toEqual({ fromKey: '2026-07-01', toKey: '2026-07-07' });
  });

  it('第2週は7日後〜13日後(週境界は目標開始日起点の7日区切り)', () => {
    expect(weekDateRange(START, 2)).toEqual({ fromKey: '2026-07-08', toKey: '2026-07-14' });
  });

  it('0以下の週番号は第1週として防御的に扱う', () => {
    expect(weekDateRange(START, 0)).toEqual(weekDateRange(START, 1));
  });
});

describe('shouldReplanNextWeek(1週1回ガード)', () => {
  it('次週分の週次プランがまだ無ければリプランする', () => {
    expect(shouldReplanNextWeek([1, 2, 3, 4], 5)).toBe(true);
  });

  it('次週分が既にあればスキップする(同じ週に二度生成しない)', () => {
    expect(shouldReplanNextWeek([1, 2, 3, 4, 5], 5)).toBe(false);
  });

  it('オンボーディング直後(4週分あり)の第1週の旗は、第2週分が既にあるためスキップする', () => {
    expect(shouldReplanNextWeek([1, 2, 3, 4], 2)).toBe(false);
  });
});

describe('collectPrevActions', () => {
  const range = weekDateRange(START, 1);

  it('範囲内の行動文言を日付昇順で返す', () => {
    const rows = [
      { date: '2026-07-03', description: '単語を10個書く' },
      { date: '2026-07-01', description: '5分だけ着手する' },
    ];
    expect(collectPrevActions(rows, range)).toEqual(['5分だけ着手する', '単語を10個書く']);
  });

  it('範囲外(前週より前・次週)の行は含めない', () => {
    const rows = [
      { date: '2026-06-30', description: '開始前の行動' },
      { date: '2026-07-01', description: '週内の行動' },
      { date: '2026-07-08', description: '次週の行動' },
    ];
    expect(collectPrevActions(rows, range)).toEqual(['週内の行動']);
  });

  it('kind=custom(ユーザー追加タスク)の文言は誤って渡されても除外する', () => {
    const rows = [
      { date: '2026-07-01', description: 'AI生成の行動', kind: 'main' },
      { date: '2026-07-02', description: '通院の予約をとる', kind: 'custom' },
      { date: '2026-07-03', description: 'AI生成の行動2' },
    ];
    expect(collectPrevActions(rows, range)).toEqual(['AI生成の行動', 'AI生成の行動2']);
  });

  it('空文言は捨て、最大7件に丸める', () => {
    const rows = [
      { date: '2026-07-01', description: '   ' },
      ...Array.from({ length: 8 }, (_, i) => ({
        date: addDaysKey('2026-07-01', i % 7),
        description: `行動${i}`,
      })),
    ];
    expect(collectPrevActions(rows, range)).toHaveLength(7);
  });
});

describe('buildReplanStats', () => {
  it('歩いた日・報告した日・おやすみを JourneyDay の状態から数える', () => {
    const days = week(['walked', 'walked', 'reported', 'grace', 'walked', 'missed', 'walked']);
    expect(buildReplanStats(days, 3)).toEqual({
      walkedDays: 4,
      reportedDays: 1,
      graceDays: 1,
      streakCurrent: 3,
    });
  });

  it('future や missed は統計に数えない', () => {
    const days = week(['walked', 'missed', 'missed', 'future', 'future', 'future', 'future']);
    expect(buildReplanStats(days, 1)).toEqual({
      walkedDays: 1,
      reportedDays: 0,
      graceDays: 0,
      streakCurrent: 1,
    });
  });
});

describe('normalizeReplanActions(dayOffsetの整合)', () => {
  it('AIが正しい絶対オフセットで返した場合はそのままの並びになる', () => {
    const actions = Array.from({ length: 7 }, (_, i) => ({
      dayOffset: 7 + i,
      description: `行動${i}`,
    }));
    expect(normalizeReplanActions(2, actions)).toEqual(actions);
  });

  it('AIが 0〜6 の相対オフセットで返しても次週の窓(第3週=14〜20)へ振り直す', () => {
    const actions = Array.from({ length: 7 }, (_, i) => ({ dayOffset: i, description: `行動${i}` }));
    expect(normalizeReplanActions(3, actions).map((a) => a.dayOffset)).toEqual([
      14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it('順不同でも dayOffset 昇順に並べ替えてから連番を振る', () => {
    const actions = [
      { dayOffset: 9, description: '3日目' },
      { dayOffset: 7, description: '1日目' },
      { dayOffset: 8, description: '2日目' },
    ];
    expect(normalizeReplanActions(2, actions)).toEqual([
      { dayOffset: 7, description: '1日目' },
      { dayOffset: 8, description: '2日目' },
      { dayOffset: 9, description: '3日目' },
    ]);
  });

  it('空文言は捨て、7件を超える分は切り詰め、前後の空白は剥がす', () => {
    const actions = [
      { dayOffset: 0, description: '  ' },
      ...Array.from({ length: 9 }, (_, i) => ({ dayOffset: i + 1, description: ` 行動${i} ` })),
    ];
    const result = normalizeReplanActions(1, actions);
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ dayOffset: 0, description: '行動0' });
  });
});

describe('replanActionsToDates', () => {
  it('dayOffset を目標開始日からの日付キーに変換する', () => {
    const actions = [
      { dayOffset: 7, description: '1日目' },
      { dayOffset: 13, description: '7日目' },
    ];
    expect(replanActionsToDates(START, actions)).toEqual([
      { date: '2026-07-08', description: '1日目' },
      { date: '2026-07-14', description: '7日目' },
    ]);
  });

  it('normalizeReplanActions と組み合わせると次週7日分の連続した日付になる', () => {
    const actions = Array.from({ length: 7 }, (_, i) => ({ dayOffset: i, description: `行動${i}` }));
    const dated = replanActionsToDates(START, normalizeReplanActions(2, actions));
    expect(dated.map((a) => a.date)).toEqual(
      Array.from({ length: 7 }, (_, i) => addDaysKey(START, 7 + i)),
    );
  });
});
