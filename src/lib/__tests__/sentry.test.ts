import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

import { isCoachApiUrl, sanitizeBreadcrumb, sanitizeEvent } from '../observability/sentry';

// @sentry/react-native はネイティブ依存のため、純関数のテストに必要な範囲だけモックする
// (jest.mock はトランスフォーム時にインポートより前へ巻き上げられる)
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: jest.fn(),
}));

describe('isCoachApiUrl', () => {
  it('コーチAPIの既知エンドポイント(coach/plan/suggest)を対象にする', () => {
    expect(isCoachApiUrl('https://coach.example.workers.dev/v1/coach')).toBe(true);
    expect(isCoachApiUrl('https://coach.example.workers.dev/v1/plan')).toBe(true);
    // ヒアリング回答・目標タイトルが乗る期間おすすめAPI(Issue #15)
    expect(isCoachApiUrl('https://coach.example.workers.dev/v1/suggest')).toBe(true);
  });

  it('クエリ・末尾スラッシュつきでも対象にする', () => {
    expect(isCoachApiUrl('https://coach.example.workers.dev/v1/suggest?x=1')).toBe(true);
    expect(isCoachApiUrl('https://coach.example.workers.dev/v1/suggest/')).toBe(true);
  });

  it('コーチAPI以外のURLは対象にしない', () => {
    expect(isCoachApiUrl(undefined)).toBe(false);
    expect(isCoachApiUrl('')).toBe(false);
    expect(isCoachApiUrl('https://example.com/v1/other')).toBe(false);
    expect(isCoachApiUrl('https://app.posthog.com/batch')).toBe(false);
  });
});

describe('sanitizeBreadcrumb', () => {
  it('/v1/suggest へのHTTPブレッドクラムから本文を除去し、診断情報は残す', () => {
    const breadcrumb: Breadcrumb = {
      type: 'http',
      category: 'fetch',
      data: {
        method: 'POST',
        url: 'https://coach.example.workers.dev/v1/suggest',
        status_code: 500,
        request_body: '{"goalTitle":"秘密の目標","hearing":[...]}',
      },
    };
    const sanitized = sanitizeBreadcrumb(breadcrumb);
    expect(sanitized.data).toEqual({
      method: 'POST',
      url: 'https://coach.example.workers.dev/v1/suggest',
      status_code: 500,
    });
  });

  it('コーチAPI以外のブレッドクラムはそのまま返す', () => {
    const breadcrumb: Breadcrumb = {
      type: 'http',
      category: 'fetch',
      data: { method: 'GET', url: 'https://example.com/health', extra: 'keep' },
    };
    expect(sanitizeBreadcrumb(breadcrumb)).toBe(breadcrumb);
  });
});

describe('sanitizeEvent', () => {
  it('/v1/suggest へのリクエスト情報(data/headers等)をイベントから除去する', () => {
    const event = {
      request: {
        url: 'https://coach.example.workers.dev/v1/suggest',
        data: '{"hearing":[{"question":"...","answer":"..."}]}',
        headers: { 'x-device-id': 'abc' },
        cookies: 'session=1',
        query_string: 'x=1',
      },
    } as unknown as ErrorEvent;
    const sanitized = sanitizeEvent(event);
    expect(sanitized.request?.url).toBe('https://coach.example.workers.dev/v1/suggest');
    expect(sanitized.request?.data).toBeUndefined();
    expect(sanitized.request?.headers).toBeUndefined();
    expect(sanitized.request?.cookies).toBeUndefined();
    expect(sanitized.request?.query_string).toBeUndefined();
  });
});
