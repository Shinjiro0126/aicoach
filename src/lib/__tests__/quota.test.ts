import { canSendMessage, consumeQuota, remainingQuota } from '../quota';

const TODAY = '2026-07-02';
const LIMIT = 10;

describe('quota', () => {
  it('未使用なら上限まで送れる', () => {
    const state = { date: '', used: 0 };
    expect(remainingQuota(state, TODAY, LIMIT, false)).toBe(10);
    expect(canSendMessage(state, TODAY, LIMIT, false)).toBe(true);
  });

  it('上限に達すると送れない', () => {
    const state = { date: TODAY, used: 10 };
    expect(remainingQuota(state, TODAY, LIMIT, false)).toBe(0);
    expect(canSendMessage(state, TODAY, LIMIT, false)).toBe(false);
  });

  it('プレミアムは無制限', () => {
    const state = { date: TODAY, used: 999 };
    expect(canSendMessage(state, TODAY, LIMIT, true)).toBe(true);
  });

  it('日付が変わるとリセットされる', () => {
    const state = { date: '2026-07-01', used: 10 };
    expect(remainingQuota(state, TODAY, LIMIT, false)).toBe(10);
    expect(consumeQuota(state, TODAY)).toEqual({ date: TODAY, used: 1 });
  });

  it('consumeQuota は同日ならインクリメント', () => {
    expect(consumeQuota({ date: TODAY, used: 3 }, TODAY)).toEqual({ date: TODAY, used: 4 });
  });
});
