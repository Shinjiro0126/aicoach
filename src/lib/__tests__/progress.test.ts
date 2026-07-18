import { HEAD_START_PERCENT, progressSummary, weekFlagInfo, weekSegments } from '../progress';

const START = '2026-07-01';
/** 13週間(91日)後 */
const TARGET = '2026-09-30';

describe('progressSummary', () => {
  it('開始日は授かり進捗の5%から始まる(0%を見せない)', () => {
    const s = progressSummary(START, TARGET, START);
    expect(s.percent).toBe(HEAD_START_PERCENT);
    expect(s.elapsedDays).toBe(1);
  });

  it('ゴール日は100%で、「あと0日」でなく到達コピーを出す', () => {
    const s = progressSummary(START, TARGET, TARGET);
    expect(s.percent).toBe(100);
    expect(s.remainingDays).toBe(0);
    expect(s.reached).toBe(true);
    expect(s.copyMain).toBe('ゴールまで、歩き切りました');
  });

  it('ゴールを過ぎても100%を超えず、到達コピーのまま(日数が増え続けない)', () => {
    const s = progressSummary(START, TARGET, '2026-10-15');
    expect(s.percent).toBe(100);
    expect(s.reached).toBe(true);
    expect(s.copyMain).toBe('ゴールまで、歩き切りました');
  });

  it('開始前でも5%を下回らない', () => {
    const s = progressSummary(START, TARGET, '2026-06-20');
    expect(s.percent).toBe(HEAD_START_PERCENT);
    expect(s.elapsedDays).toBe(1);
  });

  it('序盤(50%未満)は「ここまで歩いた」を語る', () => {
    // 13日目: 5 + 12/91*95 = 17.5… → 18%(計算値そのものを固定値で検証する)
    const s = progressSummary(START, TARGET, '2026-07-13');
    expect(s.phase).toBe('early');
    expect(s.percent).toBe(18);
    expect(s.copyMain).toBe('ここまで13日分、歩きました');
    expect(s.copySub).toBe('全体の18%地点');
  });

  it('終盤(50%以上)は「残り」を語る', () => {
    // 82日目: 5 + 81/91*95 = 89.5… → 90%、残り10日(計算値そのものを固定値で検証する)
    const s = progressSummary(START, TARGET, '2026-09-20');
    expect(s.phase).toBe('late');
    expect(s.percent).toBe(90);
    expect(s.remainingDays).toBe(10);
    expect(s.copyMain).toBe('ゴールまで、あと10日');
    expect(s.copySub).toBe('90%地点');
  });

  it('ちょうど50%は終盤扱い', () => {
    // 5 + w/91*95 >= 50 ⇔ w >= 43.1 → 44日経過(45日目)で50%超
    const s = progressSummary(START, TARGET, '2026-08-14');
    expect(s.percent).toBeGreaterThanOrEqual(50);
    expect(s.phase).toBe('late');
  });
});

describe('weekFlagInfo', () => {
  it('開始日は第1週の1日目で、旗まであと7日', () => {
    const w = weekFlagInfo(START, START, []);
    expect(w.weekNo).toBe(1);
    expect(w.dayIndex).toBe(0);
    expect(w.daysToFlag).toBe(7);
    expect(w.dots).toHaveLength(7);
    expect(w.dots[0]).toEqual({ dateKey: START, done: false, isToday: true });
  });

  it('第2週の5日目: 旗まであと3日(今日を含む)', () => {
    // 開始から11日後 = 週index 1、週内index 4
    const today = '2026-07-12';
    const w = weekFlagInfo(START, today, []);
    expect(w.weekNo).toBe(2);
    expect(w.dayIndex).toBe(4);
    expect(w.daysToFlag).toBe(3);
    expect(w.dots[4].isToday).toBe(true);
    expect(w.dots[0].dateKey).toBe('2026-07-08');
    expect(w.dots[6].dateKey).toBe('2026-07-14');
  });

  it('提出済みの日だけドットが点灯する', () => {
    const today = '2026-07-12';
    const w = weekFlagInfo(START, today, ['2026-07-08', '2026-07-09', '2026-07-12', '2026-07-01']);
    expect(w.dots.map((d) => d.done)).toEqual([true, true, false, false, true, false, false]);
    expect(w.doneCount).toBe(3); // 先週分(7/1)は数えない
  });

  it('開始前は第1週の1日目として扱う', () => {
    const w = weekFlagInfo(START, '2026-06-28', []);
    expect(w.weekNo).toBe(1);
    expect(w.dayIndex).toBe(0);
  });
});

describe('weekSegments', () => {
  it('13週間の目標は13分割', () => {
    const s = weekSegments(START, TARGET, START);
    expect(s.total).toBe(13);
    expect(s.currentIndex).toBe(0);
    expect(s.fraction).toBeCloseTo(1 / 7);
  });

  it('第2週の5日目: index=1、週内5/7まで塗る', () => {
    const s = weekSegments(START, TARGET, '2026-07-12');
    expect(s.currentIndex).toBe(1);
    expect(s.fraction).toBeCloseTo(5 / 7);
  });

  it('ゴールを過ぎたら最終週が満タン', () => {
    const s = weekSegments(START, TARGET, '2026-10-15');
    expect(s.currentIndex).toBe(s.total - 1);
    expect(s.fraction).toBe(1);
  });

  it('期間が7日未満でも1週として扱う', () => {
    const s = weekSegments(START, '2026-07-04', START);
    expect(s.total).toBe(1);
    expect(s.currentIndex).toBe(0);
  });
});
