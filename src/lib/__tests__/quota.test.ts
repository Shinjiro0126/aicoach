import { canSendMessage, consumeQuota, remainingQuota } from '../quota';

const TODAY = '2026-07-02';
/** 無料プランの上限(Config.freeDailyMessageLimit と同値) */
const LIMIT = 10;
/** プレミアムのソフトリミット(Config.premiumDailyMessageLimit と同値) */
const PREMIUM_LIMIT = 100;

describe('quota', () => {
  it('未使用なら上限まで送れる', () => {
    const state = { date: '', used: 0 };
    expect(remainingQuota(state, TODAY, LIMIT)).toBe(10);
    expect(canSendMessage(state, TODAY, LIMIT)).toBe(true);
  });

  it('上限に達すると送れない', () => {
    const state = { date: TODAY, used: 10 };
    expect(remainingQuota(state, TODAY, LIMIT)).toBe(0);
    expect(canSendMessage(state, TODAY, LIMIT)).toBe(false);
  });

  it('プレミアムは100回/日のソフトリミット(99回目まで送れる)', () => {
    const state = { date: TODAY, used: 99 };
    expect(remainingQuota(state, TODAY, PREMIUM_LIMIT)).toBe(1);
    expect(canSendMessage(state, TODAY, PREMIUM_LIMIT)).toBe(true);
  });

  it('プレミアムも100回使い切ると送れない', () => {
    const state = { date: TODAY, used: 100 };
    expect(remainingQuota(state, TODAY, PREMIUM_LIMIT)).toBe(0);
    expect(canSendMessage(state, TODAY, PREMIUM_LIMIT)).toBe(false);
  });

  it('プレミアムのソフトリミットも日付が変わるとリセットされる', () => {
    const state = { date: '2026-07-01', used: 100 };
    expect(remainingQuota(state, TODAY, PREMIUM_LIMIT)).toBe(100);
    expect(canSendMessage(state, TODAY, PREMIUM_LIMIT)).toBe(true);
  });

  it('日付が変わるとリセットされる', () => {
    const state = { date: '2026-07-01', used: 10 };
    expect(remainingQuota(state, TODAY, LIMIT)).toBe(10);
    expect(consumeQuota(state, TODAY)).toEqual({ date: TODAY, used: 1 });
  });

  it('consumeQuota は同日ならインクリメント', () => {
    expect(consumeQuota({ date: TODAY, used: 3 }, TODAY)).toEqual({ date: TODAY, used: 4 });
  });
});
