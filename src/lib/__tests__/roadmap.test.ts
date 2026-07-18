import {
  addMonthsKey,
  addWeeksKey,
  clampWeeks,
  currentWeekNo,
  durationMonthsBetween,
  isWeekDone,
  MAX_DURATION_WEEKS,
  MIN_DURATION_WEEKS,
  monthsToWeeks,
  weekIndex,
  weeksLabel,
} from '../roadmap';

describe('roadmap', () => {
  describe('weekIndex', () => {
    it('開始日〜6日後は第0週', () => {
      expect(weekIndex('2026-07-01', '2026-07-01')).toBe(0);
      expect(weekIndex('2026-07-01', '2026-07-07')).toBe(0);
    });

    it('7日後から第1週になる', () => {
      expect(weekIndex('2026-07-01', '2026-07-08')).toBe(1);
      expect(weekIndex('2026-07-01', '2026-07-14')).toBe(1);
      expect(weekIndex('2026-07-01', '2026-07-15')).toBe(2);
    });

    it('月・年を跨いでも正しい', () => {
      expect(weekIndex('2026-12-25', '2027-01-01')).toBe(1);
    });

    it('today が開始日より前なら 0(負にならない)', () => {
      expect(weekIndex('2026-07-10', '2026-07-01')).toBe(0);
    });
  });

  describe('currentWeekNo', () => {
    it('1-based の週番号を返す', () => {
      expect(currentWeekNo('2026-07-01', '2026-07-01')).toBe(1);
      expect(currentWeekNo('2026-07-01', '2026-07-08')).toBe(2);
      expect(currentWeekNo('2026-07-01', '2026-07-22')).toBe(4);
    });

    it('totalWeeks を超えたらクランプする', () => {
      // 開始から10週間後でも第4週として扱う
      expect(currentWeekNo('2026-07-01', '2026-09-09')).toBe(4);
      expect(currentWeekNo('2026-07-01', '2026-09-09', 6)).toBe(6);
    });

    it('totalWeeks が 0 でも最低 1 を返す', () => {
      expect(currentWeekNo('2026-07-01', '2026-07-01', 0)).toBe(1);
    });
  });

  describe('isWeekDone', () => {
    it('現在週より前の週だけ経過済み', () => {
      const start = '2026-07-01';
      const today = '2026-07-16'; // 第3週(index 2)
      expect(isWeekDone(start, today, 1)).toBe(true);
      expect(isWeekDone(start, today, 2)).toBe(true);
      expect(isWeekDone(start, today, 3)).toBe(false);
      expect(isWeekDone(start, today, 4)).toBe(false);
    });

    it('初日はどの週も未経過', () => {
      expect(isWeekDone('2026-07-01', '2026-07-01', 1)).toBe(false);
    });
  });

  describe('addMonthsKey', () => {
    it('月を加算できる', () => {
      expect(addMonthsKey('2026-07-14', 1)).toBe('2026-08-14');
      expect(addMonthsKey('2026-07-14', 3)).toBe('2026-10-14');
      expect(addMonthsKey('2026-07-14', 6)).toBe('2027-01-14');
      expect(addMonthsKey('2026-07-14', 12)).toBe('2027-07-14');
    });

    it('同じ日が存在しない月は月末に丸める', () => {
      expect(addMonthsKey('2026-01-31', 1)).toBe('2026-02-28');
      expect(addMonthsKey('2028-01-31', 1)).toBe('2028-02-29'); // うるう年
      expect(addMonthsKey('2026-08-31', 1)).toBe('2026-09-30');
    });
  });

  describe('durationMonthsBetween', () => {
    it('おおよその月数を返す', () => {
      expect(durationMonthsBetween('2026-07-14', addMonthsKey('2026-07-14', 1))).toBe(1);
      expect(durationMonthsBetween('2026-07-14', addMonthsKey('2026-07-14', 3))).toBe(3);
      expect(durationMonthsBetween('2026-07-14', addMonthsKey('2026-07-14', 6))).toBe(6);
      expect(durationMonthsBetween('2026-07-14', addMonthsKey('2026-07-14', 12))).toBe(12);
    });

    it('期間が極端に短くても最低1を返す', () => {
      expect(durationMonthsBetween('2026-07-14', '2026-07-15')).toBe(1);
    });
  });

  describe('monthsToWeeks', () => {
    it('プリセットの月数を週数に換算する', () => {
      expect(monthsToWeeks(1)).toBe(4);
      expect(monthsToWeeks(3)).toBe(13);
      expect(monthsToWeeks(6)).toBe(26);
      expect(monthsToWeeks(12)).toBe(52);
    });
  });

  describe('clampWeeks', () => {
    it('範囲内の週数はそのまま(端数は四捨五入)', () => {
      expect(clampWeeks(13)).toBe(13);
      expect(clampWeeks(12.6)).toBe(13);
    });

    it('2週未満は2週、104週超は104週に丸める', () => {
      expect(clampWeeks(0)).toBe(MIN_DURATION_WEEKS);
      expect(clampWeeks(1)).toBe(2);
      expect(clampWeeks(500)).toBe(MAX_DURATION_WEEKS);
    });

    it('数値でない入力は3ヶ月相当(13週)にフォールバックする', () => {
      expect(clampWeeks(Number.NaN)).toBe(13);
      expect(clampWeeks(Number.POSITIVE_INFINITY)).toBe(13);
    });
  });

  describe('weeksLabel', () => {
    it('プリセットに一致する週数は月・年表記', () => {
      expect(weeksLabel(4)).toBe('1ヶ月');
      expect(weeksLabel(13)).toBe('3ヶ月');
      expect(weeksLabel(26)).toBe('6ヶ月');
      expect(weeksLabel(52)).toBe('1年');
    });

    it('カスタム週数は「N週間」表記', () => {
      expect(weeksLabel(2)).toBe('2週間');
      expect(weeksLabel(10)).toBe('10週間');
      expect(weeksLabel(104)).toBe('104週間');
    });
  });

  describe('addWeeksKey', () => {
    it('週数×7日を加算する', () => {
      expect(addWeeksKey('2026-07-01', 1)).toBe('2026-07-08');
      expect(addWeeksKey('2026-07-01', 13)).toBe('2026-09-30');
    });

    it('年を跨いでも正しい', () => {
      expect(addWeeksKey('2026-12-25', 2)).toBe('2027-01-08');
    });
  });
});
