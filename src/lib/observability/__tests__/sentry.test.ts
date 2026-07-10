import { isCoachApiUrl, sanitizeBreadcrumb, sanitizeEvent } from '../sentry';

// `@sentry/react-native` は expo のネイティブモジュールに依存し、Jest(node環境)では
// そのままインポートできない。テスト対象の純関数はこのモジュールに依存しないため、
// 実体を読み込まずダミー実装でモックする(jest.mockはbabelによりファイル先頭へ巻き上げられる)。
jest.mock('@sentry/react-native', () => ({
  wrap: (component: unknown) => component,
  init: jest.fn(),
}));

describe('isCoachApiUrl', () => {
  it('コーチAPI(/v1/coach)のURLはtrue', () => {
    expect(isCoachApiUrl('https://api.example.com/v1/coach')).toBe(true);
  });

  it('コーチAPI(/v1/plan)のURLはtrue', () => {
    expect(isCoachApiUrl('https://api.example.com/v1/plan')).toBe(true);
  });

  it('クエリ文字列付きURLもtrue', () => {
    expect(isCoachApiUrl('https://api.example.com/v1/coach?stream=1')).toBe(true);
  });

  it('末尾スラッシュ付きURLもtrue', () => {
    expect(isCoachApiUrl('https://api.example.com/v1/coach/')).toBe(true);
  });

  it('コーチAPI以外のURLはfalse', () => {
    expect(isCoachApiUrl('https://api.example.com/v1/other')).toBe(false);
    expect(isCoachApiUrl('https://api.example.com/v1/coaching')).toBe(false);
  });

  it('undefinedはfalse', () => {
    expect(isCoachApiUrl(undefined)).toBe(false);
  });
});

describe('sanitizeBreadcrumb', () => {
  it('コーチAPIへのhttpブレッドクラムから本文・不要なメタデータを除去する', () => {
    const breadcrumb = {
      type: 'http',
      category: 'fetch',
      data: {
        url: 'https://api.example.com/v1/coach',
        method: 'POST',
        status_code: 200,
        request_body_size: 123,
        response_body_size: 456,
      },
    };

    const result = sanitizeBreadcrumb(breadcrumb as never);

    expect(result.data).toEqual({
      method: 'POST',
      url: 'https://api.example.com/v1/coach',
      status_code: 200,
    });
  });

  it('コーチAPI以外のURLのブレッドクラムはそのまま保持される', () => {
    const breadcrumb = {
      type: 'http',
      category: 'fetch',
      data: {
        url: 'https://api.example.com/v1/other',
        method: 'GET',
        status_code: 200,
        request_body_size: 123,
      },
    };

    const result = sanitizeBreadcrumb(breadcrumb as never);

    expect(result).toEqual(breadcrumb);
  });

  it('http系以外のブレッドクラムはそのまま保持される', () => {
    const breadcrumb = { type: 'default', category: 'navigation', data: { from: '/a', to: '/b' } };

    const result = sanitizeBreadcrumb(breadcrumb as never);

    expect(result).toEqual(breadcrumb);
  });
});

describe('sanitizeEvent', () => {
  it('コーチAPIへのリクエストのdata/headers/cookies/query_stringを除去する', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/plan',
        data: { goal: '英語を話せるようになる' },
        headers: { Authorization: 'Bearer secret' },
        cookies: { session: 'abc' },
        query_string: 'foo=bar',
      },
      breadcrumbs: [],
    };

    const result = sanitizeEvent(event as never);

    expect(result.request?.data).toBeUndefined();
    expect(result.request?.headers).toBeUndefined();
    expect(result.request?.cookies).toBeUndefined();
    expect(result.request?.query_string).toBeUndefined();
    expect(result.request?.url).toBe('https://api.example.com/v1/plan');
  });

  it('コーチAPI以外のリクエストはそのまま保持される', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/other',
        data: { foo: 'bar' },
        headers: { Authorization: 'Bearer secret' },
      },
    };

    const result = sanitizeEvent(event as never);

    expect(result.request?.data).toEqual({ foo: 'bar' });
    expect(result.request?.headers).toEqual({ Authorization: 'Bearer secret' });
  });

  it('breadcrumbsも併せてサニタイズされる', () => {
    const event = {
      request: undefined,
      breadcrumbs: [
        {
          type: 'http',
          category: 'fetch',
          data: {
            url: 'https://api.example.com/v1/coach',
            method: 'POST',
            status_code: 200,
            request_body_size: 999,
          },
        },
      ],
    };

    const result = sanitizeEvent(event as never);

    expect(result.breadcrumbs?.[0]?.data).toEqual({
      method: 'POST',
      url: 'https://api.example.com/v1/coach',
      status_code: 200,
    });
  });
});
