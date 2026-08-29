import {
  buildInsightFallback,
  buildTeaser,
  coldStartJourneyDays,
  comebackText,
  computeInsightStats,
  firstReportDateKey,
  insightGenerationPlan,
  isJourneyColdStart,
  journeySummaryLabel,
  maxTimeBand,
  MIN_INSIGHT_DAYS,
  notebookSchedule,
  weekAlignedJourneyDays,
  type InsightCacheRef,
  type InsightStats,
  type ReportEntry,
} from '../insight-stats';
import { weekFlagInfo } from '../progress';
import type { StreakResult } from '../streak';

const NO_STREAK: StreakResult = { current: 0, best: 0, graceUsedOn: [] };

/** ローカルタイムゾーンで指定時刻の epoch ms を作る(時間帯分布のテスト用) */
function at(dateKey: string, hour: number): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).getTime();
}

function report(dateKey: string, doneCount = 1, hour = 20): ReportEntry {
  return { dateKey, doneCount, submittedAt: at(dateKey, hour) };
}

/** テスト用の統計値(必要なフィールドだけ上書き) */
function stats(overrides: Partial<InsightStats> = {}): InsightStats {
  return {
    weekdayCounts: [0, 0, 0, 0, 0, 0, 0],
    timeBands: { morning: 0, midday: 0, night: 0 },
    stops: 0,
    nextDayReturns: 0,
    walkedDays: 0,
    zeroReportDays: 0,
    streakCurrent: 0,
    streakBest: 0,
    graceDays: 0,
    observedDays: MIN_INSIGHT_DAYS,
    ...overrides,
  };
}

describe('computeInsightStats', () => {
  it('曜日別提出数は直近3週(21日)のみ数える', () => {
    // 2026-07-25 は土曜。21日前(7/5=日曜)までが対象、22日前(7/4)は対象外
    const result = computeInsightStats(
      [report('2026-07-25'), report('2026-07-22'), report('2026-07-05'), report('2026-07-04')],
      '2026-07-25',
      NO_STREAK,
    );
    expect(result.weekdayCounts[6]).toBe(1); // 土(7/25)
    expect(result.weekdayCounts[3]).toBe(1); // 水(7/22)
    expect(result.weekdayCounts[0]).toBe(1); // 日(7/5、ちょうど21日窓の端)
    expect(result.weekdayCounts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('時間帯分布は朝5-11/昼11-17/夜17-5で区切る', () => {
    const result = computeInsightStats(
      [
        report('2026-07-20', 1, 5), // 朝(境界)
        report('2026-07-21', 1, 10), // 朝
        report('2026-07-22', 1, 11), // 昼(境界)
        report('2026-07-23', 1, 16), // 昼
        report('2026-07-24', 1, 17), // 夜(境界)
        report('2026-07-25', 1, 4), // 深夜4時は夜
      ],
      '2026-07-25',
      NO_STREAK,
    );
    expect(result.timeBands).toEqual({ morning: 2, midday: 2, night: 2 });
  });

  it('歩いた日数(done>0)と報告した日数(done=0)を分けて数える', () => {
    const result = computeInsightStats(
      [report('2026-07-23', 2), report('2026-07-24', 0), report('2026-07-25', 1)],
      '2026-07-25',
      NO_STREAK,
    );
    expect(result.walkedDays).toBe(2);
    expect(result.zeroReportDays).toBe(1);
  });

  it('復帰統計: 1日抜けは「止まった1回・翌日復帰1回」', () => {
    const result = computeInsightStats(
      [report('2026-07-20'), report('2026-07-22'), report('2026-07-25')],
      '2026-07-25',
      NO_STREAK,
    );
    // 7/21の抜け(翌日復帰)と 7/23-24の2日抜け(翌日復帰でない)
    expect(result.stops).toBe(2);
    expect(result.nextDayReturns).toBe(1);
  });

  it('復帰統計: 今日に続く抜けは2日以上たってから「止まった」と数える', () => {
    // 昨日1日だけの抜けは、今日まだ提出できるため止まった扱いにしない
    const pending = computeInsightStats([report('2026-07-23')], '2026-07-25', NO_STREAK);
    expect(pending.stops).toBe(0);
    // 2日以上あいたら止まった(未復帰)として数える
    const stopped = computeInsightStats([report('2026-07-22')], '2026-07-25', NO_STREAK);
    expect(stopped.stops).toBe(1);
    expect(stopped.nextDayReturns).toBe(0);
  });

  it('観察日数は初提出日から今日まで(提出0件なら0)', () => {
    expect(computeInsightStats([], '2026-07-25', NO_STREAK).observedDays).toBe(0);
    expect(
      computeInsightStats([report('2026-07-12')], '2026-07-25', NO_STREAK).observedDays,
    ).toBe(14);
  });

  it('ストリークと救済日数を統計値へ引き継ぐ', () => {
    const streak: StreakResult = { current: 5, best: 9, graceUsedOn: ['2026-07-20'] };
    const result = computeInsightStats([report('2026-07-25')], '2026-07-25', streak);
    expect(result.streakCurrent).toBe(5);
    expect(result.streakBest).toBe(9);
    expect(result.graceDays).toBe(1);
  });
});

describe('buildTeaser', () => {
  it('データ2週未満は「観察中」文を返す', () => {
    expect(buildTeaser(stats({ observedDays: MIN_INSIGHT_DAYS - 1 }))).toContain('観察中');
  });

  it('最強曜日(3回以上・単独最多)を最優先で選ぶ', () => {
    const teaser = buildTeaser(
      stats({ weekdayCounts: [1, 1, 1, 3, 1, 0, 1], stops: 1, nextDayReturns: 1 }),
    );
    expect(teaser).toContain('水曜に強い');
  });

  it('曜日が拮抗していれば復帰力の見立てを選ぶ', () => {
    const teaser = buildTeaser(
      stats({ weekdayCounts: [2, 2, 0, 0, 0, 0, 0], stops: 2, nextDayReturns: 2 }),
    );
    expect(teaser).toContain('止まった2回');
    expect(teaser).toContain('翌日に戻りました');
  });

  it('曜日も復帰力も決め手がなければ時間帯を選ぶ', () => {
    const teaser = buildTeaser(
      stats({ timeBands: { morning: 1, midday: 0, night: 8 } }),
    );
    expect(teaser).toContain('夜');
  });

  it('同じ統計値からは常に同じ文になる(決定的)', () => {
    const s = stats({ weekdayCounts: [0, 4, 0, 0, 0, 0, 0] });
    expect(buildTeaser(s)).toBe(buildTeaser(s));
  });
});

describe('buildInsightFallback', () => {
  it('総評は3文で、観察日数の事実から始まる', () => {
    const result = buildInsightFallback(stats({ observedDays: 13, walkedDays: 11 }));
    expect(result.letter).toContain('13日間');
    expect(result.letter.split('。').filter(Boolean)).toHaveLength(3);
  });

  it('タイプ名は15字以内で、最多時間帯を反映する', () => {
    const result = buildInsightFallback(
      stats({ timeBands: { morning: 0, midday: 1, night: 9 }, walkedDays: 10 }),
    );
    expect(result.typeName).toBe('夜に整える、堅実な歩き手');
    expect(result.typeName.length).toBeLessThanOrEqual(15);
  });

  it('曜日解説は事実+「傾向があります」の形になる', () => {
    const result = buildInsightFallback(stats({ weekdayCounts: [0, 0, 0, 4, 1, 0, 0] }));
    expect(result.weekdayNote).toContain('水曜の提出が4回で最多');
    expect(result.weekdayNote).toContain('傾向があります');
  });

  it('作戦は最少曜日を軽くする作戦形になる', () => {
    const result = buildInsightFallback(stats({ weekdayCounts: [1, 2, 1, 4, 1, 0, 1] }));
    expect(result.plan).toContain('金曜の一歩を5分版に軽くします');
    expect(result.plan).toContain('水曜の勢い');
  });

  it('データが薄くてもすべてのフィールドが空にならない', () => {
    const result = buildInsightFallback(stats({ observedDays: 0 }));
    expect(result.letter.length).toBeGreaterThan(0);
    expect(result.typeName.length).toBeGreaterThan(0);
    expect(result.weekdayNote.length).toBeGreaterThan(0);
    expect(result.plan.length).toBeGreaterThan(0);
  });
});

describe('comebackText', () => {
  it('分母ゼロは「まだ一度も止まっていません」系の代替文', () => {
    expect(comebackText(stats({ stops: 0 }))).toContain('まだ一度も止まっていません');
  });

  it('全回復帰と部分復帰で文を切り替える', () => {
    expect(comebackText(stats({ stops: 2, nextDayReturns: 2 }))).toContain('すべて翌日に戻りました');
    expect(comebackText(stats({ stops: 3, nextDayReturns: 1 }))).toContain('3回のうち、1回は翌日に戻りました');
  });
});

describe('maxTimeBand', () => {
  it('単独最多のバンドを返し、全0・タイは null', () => {
    expect(maxTimeBand({ morning: 1, midday: 0, night: 3 })).toBe('night');
    expect(maxTimeBand({ morning: 0, midday: 0, night: 0 })).toBeNull();
    expect(maxTimeBand({ morning: 2, midday: 2, night: 0 })).toBeNull();
  });
});

describe('notebookSchedule', () => {
  it('データ2週未満は未提供で、最初の手帳までの日数を返す', () => {
    // 初提出から11日目(days=10): あと3日でデータ2週
    const result = notebookSchedule('2026-07-01', '2026-07-11');
    expect(result.availableWeekNo).toBe(0);
    expect(result.daysToFirst).toBe(3);
    expect(result.latestFlagDateKey).toBeNull();
  });

  it('提出が1件も無ければ観察は始まっておらず、最初の手帳まで丸2週間', () => {
    const result = notebookSchedule(null, '2026-07-25');
    expect(result.availableWeekNo).toBe(0);
    expect(result.daysToFirst).toBe(MIN_INSIGHT_DAYS);
    expect(result.daysToNext).toBe(MIN_INSIGHT_DAYS);
    expect(result.latestFlagDateKey).toBeNull();
  });

  it('初提出から14日目(観察第2週の旗の日)に最初の手帳が書ける', () => {
    const result = notebookSchedule('2026-07-01', '2026-07-14');
    expect(result.availableWeekNo).toBe(2);
    expect(result.daysToFirst).toBe(0);
    expect(result.latestFlagDateKey).toBe('2026-07-14');
    expect(result.daysToNext).toBe(7);
  });

  it('次の旗の日まで daysToNext が1日ずつ減り、旗の日に次の週へ進む', () => {
    expect(notebookSchedule('2026-07-01', '2026-07-18').daysToNext).toBe(3);
    expect(notebookSchedule('2026-07-01', '2026-07-20').daysToNext).toBe(1);
    const next = notebookSchedule('2026-07-01', '2026-07-21');
    expect(next.availableWeekNo).toBe(3);
    expect(next.latestFlagDateKey).toBe('2026-07-21');
    expect(next.daysToNext).toBe(7);
  });

  it('週の旗の日は初提出日起点の7日区切りの最終日になる', () => {
    // 観察第2週の旗 = 初提出日+13日目
    const result = notebookSchedule('2026-07-01', '2026-07-16');
    expect(result.latestFlagDateKey).toBe('2026-07-14');
  });

  it('「データ2週」の判定は stats.observedDays(初提出日基準)と一致する', () => {
    // Issue #30: 目標開始が古くても、初提出から2週未満なら観察中(あと0日にならない)
    const reports = [report('2026-07-20'), report('2026-07-24')];
    const stats = computeInsightStats(reports, '2026-07-25', NO_STREAK);
    const schedule = notebookSchedule(firstReportDateKey(reports), '2026-07-25');
    expect(stats.observedDays).toBe(6);
    expect(schedule.availableWeekNo).toBe(0);
    expect(schedule.daysToFirst).toBe(MIN_INSIGHT_DAYS - stats.observedDays);
    // 観察日数がちょうど2週に達した日に手帳が書ける
    const ready = notebookSchedule('2026-07-12', '2026-07-25');
    expect(computeInsightStats([report('2026-07-12')], '2026-07-25', NO_STREAK).observedDays).toBe(14);
    expect(ready.availableWeekNo).toBe(2);
  });
});

describe('insightGenerationPlan', () => {
  const cache = (overrides: Partial<InsightCacheRef> = {}): InsightCacheRef => ({
    goalId: 'g1',
    weekNo: 2,
    fallback: false,
    ...overrides,
  });

  it('キャッシュが現行週と一致していれば生成しない', () => {
    expect(insightGenerationPlan(cache(), 'g1', 2)).toEqual({
      generate: false,
      retryFallback: false,
    });
  });

  it('キャッシュ無し・別目標のキャッシュは新規生成する(retryFallbackではない)', () => {
    expect(insightGenerationPlan(null, 'g1', 2)).toEqual({ generate: true, retryFallback: false });
    expect(insightGenerationPlan(cache({ goalId: 'g0' }), 'g1', 2)).toEqual({
      generate: true,
      retryFallback: false,
    });
  });

  it('データ2週未満(availableWeekNo=0)は観察中で、生成しない', () => {
    expect(insightGenerationPlan(null, 'g1', 0).generate).toBe(false);
    expect(insightGenerationPlan(cache(), 'g1', 0).generate).toBe(false);
  });

  it('フォールバック文で保存された週は、静かな再生成(retryFallback)になる', () => {
    expect(insightGenerationPlan(cache({ fallback: true }), 'g1', 2)).toEqual({
      generate: true,
      retryFallback: true,
    });
  });

  it('画面を開いたまま週の旗の日を跨いで観察週が進むと、キャッシュ不一致で再生成が必要になる', () => {
    // Issue #31: 表示ゲート(cacheMatched)が false へ落ちるのと同じ条件で、生成側も真になること
    const first = '2026-07-01';
    // 第3週の旗の日(7/21)の前日までは、第2週キャッシュのままで生成不要
    const before = notebookSchedule(first, '2026-07-20');
    expect(before.availableWeekNo).toBe(2);
    expect(insightGenerationPlan(cache({ weekNo: 2 }), 'g1', before.availableWeekNo).generate).toBe(
      false,
    );
    // 旗の日を迎えると観察週が第3週へ進み、同じキャッシュでは再生成が必要になる
    const after = notebookSchedule(first, '2026-07-21');
    expect(after.availableWeekNo).toBe(3);
    expect(insightGenerationPlan(cache({ weekNo: 2 }), 'g1', after.availableWeekNo)).toEqual({
      generate: true,
      retryFallback: false,
    });
  });
});

describe('firstReportDateKey', () => {
  it('最古の提出日を返し、提出が無ければ null', () => {
    expect(firstReportDateKey([])).toBeNull();
    expect(
      firstReportDateKey([report('2026-07-20'), report('2026-07-12'), report('2026-07-25')]),
    ).toBe('2026-07-12');
  });
});

describe('weekAlignedJourneyDays / coldStartJourneyDays', () => {
  // 開始 2026-07-19(第1週: 7/19〜7/25、第2週: 7/26〜8/1、第3週: 8/2〜8/8)
  const start = '2026-07-19';

  it('第2週は先週頭〜今週末の週アライン14日を古い順に返す', () => {
    const days = weekAlignedJourneyDays(start, [], [], '2026-07-28');
    expect(days).toHaveLength(14);
    expect(days[0].dateKey).toBe('2026-07-19'); // 先週(第1週)の初日
    expect(days[6].dateKey).toBe('2026-07-25'); // 先週の最終日
    expect(days[7].dateKey).toBe('2026-07-26'); // 今週(第2週)の初日
    expect(days[13].dateKey).toBe('2026-08-01'); // 今週の旗の日
    expect(days[9]).toMatchObject({ dateKey: '2026-07-28', isToday: true });
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it('今日より後は future、今日以前は従来の state 判定になる', () => {
    const days = weekAlignedJourneyDays(
      start,
      [report('2026-07-28', 1), report('2026-07-27', 0)],
      ['2026-07-26'],
      '2026-07-28',
    );
    expect(days[9]).toMatchObject({ dateKey: '2026-07-28', state: 'walked', isToday: true });
    expect(days[8].state).toBe('reported');
    expect(days[7].state).toBe('grace');
    expect(days[6].state).toBe('missed'); // 先週の未提出日
    expect(days.slice(10).every((d) => d.state === 'future')).toBe(true);
  });

  it('点線(future)の数は今日提出の有無に依らず weekFlagInfo.daysToFlag - 1 と一致する', () => {
    // 週の1日目・4日目・7日目(旗の日)で検証
    for (const today of ['2026-07-26', '2026-07-29', '2026-08-01']) {
      const flag = weekFlagInfo(start, today, []);
      const expected = flag.daysToFlag - 1; // ヘッダー表示「旗まであとn日」と同じ定義
      const submitted = weekAlignedJourneyDays(start, [report(today, 1)], [], today);
      const notSubmitted = weekAlignedJourneyDays(start, [], [], today);
      expect(submitted.filter((d) => d.state === 'future')).toHaveLength(expected);
      expect(notSubmitted.filter((d) => d.state === 'future')).toHaveLength(expected);
      // 今日提出済みでも今日の石は点線にならない
      expect(submitted.find((d) => d.isToday)?.state).toBe('walked');
    }
  });

  it('週境界: 旗の日と翌週初日で窓が1週スライドする', () => {
    // 第2週7日目(旗の日): 窓は第1週+第2週のまま、future は無い
    const flagDay = weekAlignedJourneyDays(start, [], [], '2026-08-01');
    expect(flagDay[0].dateKey).toBe('2026-07-19');
    expect(flagDay[13]).toMatchObject({ dateKey: '2026-08-01', isToday: true });
    expect(flagDay.filter((d) => d.state === 'future')).toHaveLength(0);
    // 第3週初日: 窓が第2週+第3週へスライドし、今日は下段(今週)の先頭になる
    const nextWeek = weekAlignedJourneyDays(start, [], [], '2026-08-02');
    expect(nextWeek[0].dateKey).toBe('2026-07-26');
    expect(nextWeek[7]).toMatchObject({ dateKey: '2026-08-02', isToday: true });
    expect(nextWeek.filter((d) => d.state === 'future')).toHaveLength(6);
  });

  it('weekFlagInfo と同じ週境界を使う(下段7日=今週の dots と一致)', () => {
    for (const today of ['2026-07-26', '2026-07-30', '2026-08-05']) {
      const days = weekAlignedJourneyDays(start, [], [], today);
      const flag = weekFlagInfo(start, today, []);
      expect(days.slice(7).map((d) => d.dateKey)).toEqual(flag.dots.map((d) => d.dateKey));
    }
  });

  it('第1週に呼ばれた場合(防御): 開始前の日は beforeStart になる', () => {
    // 通常は第1週はコールドスタート側を使うが、呼ばれても開始前を missed にしない
    const days = weekAlignedJourneyDays(start, [report('2026-07-20', 1)], [], '2026-07-21');
    for (let i = 0; i < 7; i += 1) {
      expect(days[i].state).toBe('beforeStart'); // 7/12〜7/18 は開始前
    }
    expect(days[7]).toMatchObject({ dateKey: '2026-07-19', state: 'missed' });
    expect(days[8].state).toBe('walked');
    expect(days[9]).toMatchObject({ dateKey: '2026-07-21', isToday: true });
  });

  it('コールドスタートは現在週7日分で、今日より先は future になる', () => {
    const days = coldStartJourneyDays('2026-07-23', [report('2026-07-23', 1)], [], '2026-07-24');
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ dateKey: '2026-07-23', state: 'walked' });
    expect(days[1]).toMatchObject({ dateKey: '2026-07-24', isToday: true });
    expect(days[2].state).toBe('future');
    expect(days[6].state).toBe('future');
  });

  it('コールドスタートで2週目に入ったら現在週の7日を表示する', () => {
    const days = coldStartJourneyDays('2026-07-15', [], [], '2026-07-23');
    expect(days[0].dateKey).toBe('2026-07-22'); // 第2週の初日
    expect(days[1].isToday).toBe(true);
  });

  it('accessibilityLabel 用の要約文: 未来日を含む週アライン14日は「先週と今週」と読む', () => {
    const days = weekAlignedJourneyDays(
      start,
      [report('2026-07-28', 1), report('2026-07-27', 1), report('2026-07-26', 0)],
      ['2026-07-25'],
      '2026-07-28',
    );
    const label = journeySummaryLabel(days, 2, 4);
    expect(label).toBe('先週と今週: 歩いた日2、報告した日1、おやすみ1。第2週の旗まであと4日');
  });

  it('旗の日(daysToFlag=0)は「あと0日」でなく「今日は旗の日」と読み、未来日が無いため「直近14日」と読む', () => {
    const days = weekAlignedJourneyDays(start, [report('2026-08-01', 1)], [], '2026-08-01');
    const label = journeySummaryLabel(days, 2, 0);
    expect(label).toBe('直近14日: 歩いた日1、報告した日0、おやすみ0。今日は第2週の旗の日');
  });

  it('旗の前日(daysToFlag=1)は境界でも従来どおり「あと1日」と読む', () => {
    const days = weekAlignedJourneyDays(start, [report('2026-07-31', 1)], [], '2026-07-31');
    const label = journeySummaryLabel(days, 2, 1);
    expect(label).toBe('先週と今週: 歩いた日1、報告した日0、おやすみ0。第2週の旗まであと1日');
  });

  it('未来日を含むコールドスタートの要約は「直近N日」ではなく「今週」と読む', () => {
    const days = coldStartJourneyDays('2026-07-23', [report('2026-07-23', 1)], [], '2026-07-24');
    const label = journeySummaryLabel(days, 1, 6);
    expect(label).toBe('今週: 歩いた日1、報告した日0、おやすみ0。第1週の旗まであと6日');
  });

  it('journeySummaryLabel は future / beforeStart を歩いた日・報告した日・おやすみに数えない', () => {
    // 第1週の防御的呼び出し: beforeStart(先頭7日)と future(今日より後)が混在する
    const days = weekAlignedJourneyDays(start, [report('2026-07-21', 1)], [], '2026-07-21');
    const label = journeySummaryLabel(days, 1, 4);
    expect(label).toBe('先週と今週: 歩いた日1、報告した日0、おやすみ0。第1週の旗まであと4日');
  });
});

describe('isJourneyColdStart', () => {
  it('第1週(開始から7日未満)はコールドスタート、8日目からは通常レイアウト', () => {
    const start = '2026-07-19';
    expect(isJourneyColdStart(start, '2026-07-19')).toBe(true); // 開始日当日(1日目)
    expect(isJourneyColdStart(start, '2026-07-25')).toBe(true); // 7日目(diffDays=6)
    expect(isJourneyColdStart(start, '2026-07-26')).toBe(false); // 8日目(diffDays=7)= 第2週初日
    expect(isJourneyColdStart(start, '2026-08-10')).toBe(false);
  });
});
