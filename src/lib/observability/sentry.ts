import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

/**
 * クラッシュ検知(Sentry)。
 *
 * `src/lib/ai/client.ts` が EXPO_PUBLIC_COACH_API_URL 未設定時にモックへフォールバックするのと同じ思想で、
 * EXPO_PUBLIC_SENTRY_DSN が未設定の場合は Sentry を無効化(enabled: false)して初期化する。
 * これによりローカル開発やDSN未設定のビルドでもエラーなく動作する。
 */

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/** コーチAPI(プロキシ)へのリクエストかどうかを判定する(会話内容が乗るエンドポイントのみ対象) */
export function isCoachApiUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /\/v1\/(coach|plan)(\?|\/|$)/.test(url);
}

/**
 * fetch/xhr のブレッドクラムから、コーチAPIへのリクエスト/レスポンス本文(会話テキスト)を除去する。
 * 通信が発生した事実・ステータスコードは診断に有用なため残す。
 */
export function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const isHttpBreadcrumb =
    breadcrumb.type === 'http' || breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr';
  if (!isHttpBreadcrumb) return breadcrumb;

  const url = typeof breadcrumb.data?.url === 'string' ? breadcrumb.data.url : undefined;
  if (!isCoachApiUrl(url)) return breadcrumb;

  return {
    ...breadcrumb,
    data: {
      method: breadcrumb.data?.method,
      url,
      status_code: breadcrumb.data?.status_code,
    },
  };
}

/** イベント本体(request.data/headers等)からコーチAPIの会話ペイロードを除去する */
export function sanitizeEvent(event: ErrorEvent): ErrorEvent {
  if (event.request && isCoachApiUrl(event.request.url)) {
    event.request = {
      ...event.request,
      data: undefined,
      headers: undefined,
      cookies: undefined,
      query_string: undefined,
    };
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(sanitizeBreadcrumb);
  }
  return event;
}

export function initSentry(): void {
  Sentry.init({
    dsn,
    enabled: dsn.length > 0,
    // 個人を特定する情報(IPアドレス等)を自動付与しない
    sendDefaultPii: false,
    beforeBreadcrumb: (breadcrumb) => sanitizeBreadcrumb(breadcrumb),
    beforeSend: (event) => sanitizeEvent(event),
  });
}

export const wrapWithSentry = Sentry.wrap;
