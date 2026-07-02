import { computeStreak } from '../streak';

const TODAY = '2026-07-02';

describe('computeStreak', () => {
  it('記録がなければ0', () => {
    expect(computeStreak([], TODAY)).toEqual({ current: 0, best: 0, graceUsedOn: [] });
  });

  it('今日だけ達成で1', () => {
    expect(computeStreak(['2026-07-02'], TODAY).current).toBe(1);
  });

  it('連続した日をカウントする', () => {
    const dates = ['2026-06-30', '2026-07-01', '2026-07-02'];
    expect(computeStreak(dates, TODAY).current).toBe(3);
  });

  it('今日未達成でも昨日までのストリークは維持される', () => {
    const dates = ['2026-06-30', '2026-07-01'];
    expect(computeStreak(dates, TODAY).current).toBe(2);
  });

  it('1日の抜けは救済されてストリークが続く', () => {
    // 6/29, 6/30 達成 → 7/1 抜け → 7/2 達成
    const dates = ['2026-06-29', '2026-06-30', '2026-07-02'];
    const result = computeStreak(dates, TODAY);
    expect(result.current).toBe(3);
    expect(result.graceUsedOn).toEqual(['2026-07-01']);
  });

  it('2日連続の抜けはストリークを断ち切る', () => {
    const dates = ['2026-06-28', '2026-06-29', '2026-07-02'];
    expect(computeStreak(dates, TODAY).current).toBe(1);
  });

  it('救済は7日以内に2回使えない', () => {
    // 7/2達成, 7/1抜け(救済1), 6/30達成, 6/29抜け(7日以内なので救済不可)
    const dates = ['2026-06-28', '2026-06-30', '2026-07-02'];
    expect(computeStreak(dates, TODAY).current).toBe(2);
  });

  it('7日以上離れていれば救済を再度使える', () => {
    // 7/2から連続、7/1抜け(救済)、6/24-6/30のうち6/23抜け(9日離れているので救済可)
    const dates = [
      '2026-06-21',
      '2026-06-22',
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
      '2026-07-02',
    ];
    const result = computeStreak(dates, TODAY);
    // 救済日はカウントに含まれない(達成した10日分)
    expect(result.current).toBe(10);
    expect(result.graceUsedOn).toEqual(['2026-07-01', '2026-06-23']);
  });

  it('bestは過去の途切れたランも含めて最長を返す', () => {
    // 過去に5連続、現在は2連続
    const dates = [
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
      '2026-06-13',
      '2026-06-14',
      '2026-07-01',
      '2026-07-02',
    ];
    const result = computeStreak(dates, TODAY);
    expect(result.current).toBe(2);
    expect(result.best).toBe(5);
  });

  it('月跨ぎ・年跨ぎでも正しくカウントする', () => {
    const dates = ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'];
    expect(computeStreak(dates, '2026-01-02').current).toBe(4);
  });
});
