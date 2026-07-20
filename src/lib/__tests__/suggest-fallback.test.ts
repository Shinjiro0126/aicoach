import { mockSuggest } from '../ai/mock';
import {
  buildSuggestKey,
  fallbackSuggestion,
  SUGGEST_REASON_MAX_CHARS,
  SUGGEST_TIMEOUT_MS,
  withTimeout,
} from '../ai/suggest-fallback';

describe('suggest-fallback', () => {
  describe('fallbackSuggestion', () => {
    it('カテゴリ別の決定的な週数を返す(習慣系13週・積み上げ系26週)', () => {
      expect(fallbackSuggestion('health', '毎朝走る').weeks).toBe(13);
      expect(fallbackSuggestion('training', 'ベンチプレス80kgを上げる').weeks).toBe(13);
      expect(fallbackSuggestion('career', '転職する').weeks).toBe(26);
      expect(fallbackSuggestion('learning', 'TOEIC800点').weeks).toBe(26);
      expect(fallbackSuggestion('money', '100万円貯める').weeks).toBe(26);
      expect(fallbackSuggestion('other', '毎日日記を書く').weeks).toBe(13);
    });

    it('同じ入力なら常に同じ結果(決定的)', () => {
      const a = fallbackSuggestion('training', 'ベンチプレス80kgを上げる');
      const b = fallbackSuggestion('training', 'ベンチプレス80kgを上げる');
      expect(a).toEqual(b);
    });

    it('理由文は週数と同じ期間表記を含む(3ヶ月/6ヶ月)', () => {
      expect(fallbackSuggestion('training', '目標').reason).toContain('3ヶ月');
      expect(fallbackSuggestion('health', '目標').reason).toContain('3ヶ月');
      expect(fallbackSuggestion('career', '目標').reason).toContain('6ヶ月');
      expect(fallbackSuggestion('learning', '目標').reason).toContain('6ヶ月');
      expect(fallbackSuggestion('money', '目標').reason).toContain('6ヶ月');
    });

    it('理由文はカード3行(全角55文字)に収まる長さ(レイアウトジャンプ防止)', () => {
      // 上限を超えるとおすすめカードが伸びてクロスフェード中にレイアウトが跳ねる。
      // プロキシ側プロンプト(SUGGEST_SYSTEM)の「全角55文字以内」と同じ前提
      for (const cat of ['health', 'training', 'career', 'learning', 'money', 'other', null]) {
        const { reason } = fallbackSuggestion(cat, '毎日日記を書く');
        expect([...reason].length).toBeLessThanOrEqual(SUGGEST_REASON_MAX_CHARS);
      }
      // mockSuggest のヒアリング補正後の理由文も同じ上限に収まる
      const adjusted = mockSuggest({
        goalTitle: 'ベンチプレス80kgを上げる',
        category: 'training',
        hearingAnswers: [{ question: '頻度は?', answer: 'まったくしていない' }],
      });
      expect([...adjusted.reason].length).toBeLessThanOrEqual(SUGGEST_REASON_MAX_CHARS);
    });

    it('エラーの気配を出す文言を含まない(成功時と同じ見た目で出すため)', () => {
      for (const cat of ['health', 'training', 'career', 'learning', 'money', 'other', null]) {
        const { reason } = fallbackSuggestion(cat, '目標');
        expect(reason).not.toMatch(/通信|オフライン|エラー|失敗|接続/);
      }
    });

    it('未知・未設定カテゴリは other 扱いで、目標タイトルを理由文に添える', () => {
      const res = fallbackSuggestion('unknown-category', '毎日日記を書く');
      expect(res.weeks).toBe(13);
      expect(res.reason).toContain('毎日日記を書く');
      expect(fallbackSuggestion(null, '毎日日記を書く').weeks).toBe(13);
      expect(fallbackSuggestion(undefined, '毎日日記を書く').weeks).toBe(13);
    });

    it('タイトルが空でも理由文が成立する', () => {
      const res = fallbackSuggestion('other', '  ');
      expect(res.weeks).toBe(13);
      expect(res.reason.length).toBeGreaterThan(0);
      expect(res.reason).not.toContain('「');
    });

    it('mockSuggest はヒアリング補正がなければフォールバック見立てと一致する', () => {
      expect(mockSuggest({ goalTitle: 'ベンチプレス80kgを上げる', category: 'training' })).toEqual(
        fallbackSuggestion('training', 'ベンチプレス80kgを上げる'),
      );
    });

    it('mockSuggest はヒアリング回答で週数を補正し、理由文の期間表記と矛盾しない', () => {
      const res = mockSuggest({
        goalTitle: 'ベンチプレス80kgを上げる',
        category: 'training',
        hearingAnswers: [{ question: '頻度は?', answer: 'まったくしていない' }],
      });
      expect(res.weeks).toBe(17);
      // 補正後は「3ヶ月」の固定文言ではなく週数ベースの理由文になる
      expect(res.reason).toContain('17週間');
    });
  });

  describe('buildSuggestKey', () => {
    it('同じ入力なら同じキー', () => {
      const pairs = [{ question: 'Q1', answer: 'A1' }];
      expect(buildSuggestKey('目標', 'training', pairs)).toBe(buildSuggestKey('目標', 'training', pairs));
    });

    it('目標・カテゴリ・回答のどれかが変わればキーも変わる(再取得の判定)', () => {
      const pairs = [{ question: 'Q1', answer: 'A1' }];
      const base = buildSuggestKey('目標', 'training', pairs);
      expect(buildSuggestKey('別の目標', 'training', pairs)).not.toBe(base);
      expect(buildSuggestKey('目標', 'health', pairs)).not.toBe(base);
      expect(buildSuggestKey('目標', 'training', [{ question: 'Q1', answer: 'A2' }])).not.toBe(base);
      expect(buildSuggestKey('目標', 'training', [])).not.toBe(base);
    });

    it('カテゴリ未設定(null/undefined)は同じキーになる', () => {
      expect(buildSuggestKey('目標', null, [])).toBe(buildSuggestKey('目標', undefined, []));
    });
  });

  describe('withTimeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('タイムアウト時間は6秒', () => {
      expect(SUGGEST_TIMEOUT_MS).toBe(6000);
    });

    it('期限内に解決すればその値を返す', async () => {
      await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
    });

    it('期限を過ぎたら Error("timeout") で reject する', async () => {
      const never = new Promise<never>(() => {});
      const promise = withTimeout(never, 1000);
      const assertion = expect(promise).rejects.toThrow('timeout');
      jest.advanceTimersByTime(1000);
      await assertion;
    });

    it('期限より手前ではタイムアウトしない', async () => {
      let settled = false;
      const promise = withTimeout(new Promise<never>(() => {}), 1000);
      promise.catch(() => {
        settled = true;
      });
      jest.advanceTimersByTime(999);
      await Promise.resolve();
      expect(settled).toBe(false);
      jest.advanceTimersByTime(1);
      await expect(promise).rejects.toThrow('timeout');
    });

    it('元のPromiseの失敗はそのまま伝播する', async () => {
      await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
    });

    it('Error以外での reject も Error に包んで伝播する', async () => {
      await expect(withTimeout(Promise.reject('plain'), 1000)).rejects.toThrow('plain');
    });
  });
});
