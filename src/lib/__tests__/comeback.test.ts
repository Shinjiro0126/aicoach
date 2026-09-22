import { buildComebackLetter, comebackGapDays, isComebackDay } from '../comeback';
import { computeStreak } from '../streak';

const TODAY = '2026-09-22';

describe('isComebackDay', () => {
  it('提出履歴がなければ false(初日)', () => {
    expect(isComebackDay([], TODAY)).toBe(false);
  });

  it('今日提出済みなら false', () => {
    expect(isComebackDay(['2026-09-19', '2026-09-22'], TODAY)).toBe(false);
  });

  it('昨日提出(空きなし)は false', () => {
    expect(isComebackDay(['2026-09-21'], TODAY)).toBe(false);
  });

  it('1日抜け(救済内)は false — ストリークは救済で守られている', () => {
    // 9/20 提出 → 9/21 抜け → 9/22(今日)。streak.ts では救済されて途切れない
    const dates = ['2026-09-19', '2026-09-20'];
    expect(isComebackDay(dates, TODAY)).toBe(false);
    // 救済ルールとの整合: この抜けでは current は途切れていない
    expect(computeStreak(dates, TODAY).current).toBe(2);
  });

  it('ちょうど2日空いたら true — 救済を超えてストリークが途切れた', () => {
    // 9/19 提出 → 9/20・9/21 抜け → 9/22(今日)
    const dates = ['2026-09-18', '2026-09-19'];
    expect(isComebackDay(dates, TODAY)).toBe(true);
    // 救済ルールとの整合: 2日以上の抜けで current は 0 に戻っている
    expect(computeStreak(dates, TODAY).current).toBe(0);
  });

  it('長期離脱でも true', () => {
    expect(isComebackDay(['2026-08-01', '2026-08-02'], TODAY)).toBe(true);
  });

  it('日付キーの並び順に依存しない', () => {
    expect(isComebackDay(['2026-09-19', '2026-09-10', '2026-09-15'], TODAY)).toBe(true);
    expect(isComebackDay(['2026-09-10', '2026-09-21', '2026-09-15'], TODAY)).toBe(false);
  });

  it('月跨ぎでも空き日数を正しく数える', () => {
    // 8/30 提出 → 8/31・9/1 … と空いて 9/22
    expect(isComebackDay(['2026-08-30'], '2026-09-01')).toBe(false); // 空き1日(8/31)は救済内
    expect(isComebackDay(['2026-08-30'], '2026-09-02')).toBe(true); // 空き2日で復帰の日
  });
});

describe('comebackGapDays', () => {
  it('提出なしは 0', () => {
    expect(comebackGapDays([], TODAY)).toBe(0);
  });

  it('今日提出済みは 0', () => {
    expect(comebackGapDays(['2026-09-19', '2026-09-22'], TODAY)).toBe(0);
  });

  it('昨日提出は 0(空きなし)', () => {
    expect(comebackGapDays(['2026-09-21'], TODAY)).toBe(0);
  });

  it('空いた丸1日の数を返す', () => {
    expect(comebackGapDays(['2026-09-20'], TODAY)).toBe(1);
    expect(comebackGapDays(['2026-09-19'], TODAY)).toBe(2);
    expect(comebackGapDays(['2026-09-01'], TODAY)).toBe(20);
  });
});

describe('buildComebackLetter', () => {
  it('止まった日数と歩いた日数から3文で組み立てる(決定的)', () => {
    const letter = buildComebackLetter(2, 14);
    expect(letter).toBe(
      '2日ぶりに、この道で会えました。これまで歩いた14日は、止まっていた間も消えずにここに残っています。今日の一歩は、いつもより軽い版で十分です。',
    );
    // 決定的テンプレート: 同じ入力なら常に同じ手紙
    expect(buildComebackLetter(2, 14)).toBe(letter);
  });

  it('3文以内である', () => {
    const letter = buildComebackLetter(5, 3);
    expect(letter.split('。').filter((s) => s.length > 0)).toHaveLength(3);
  });

  it('歩いた日が0日でも「歩いた0日」とは書かない', () => {
    const letter = buildComebackLetter(3, 0);
    expect(letter).not.toContain('0日');
    expect(letter).toContain('3日ぶりに');
  });

  it('責め語・救済専用語を含まない', () => {
    for (const letter of [buildComebackLetter(2, 10), buildComebackLetter(30, 0)]) {
      expect(letter).not.toContain('サボ');
      expect(letter).not.toContain('途切れ');
      expect(letter).not.toContain('失敗');
      // 「おやすみ」は救済で守られた日の専用語(復帰文脈では使わない)
      expect(letter).not.toContain('おやすみ');
    }
  });
});
