import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

import { Config } from '@/constants/config';

/**
 * クラッシュ検知(Sentry)。
 *
 * `src/lib/ai/client.ts` が EXPO_PUBLIC_COACH_API_URL 未設定時にモックへフォールバックするのと同じ思想で、
 * EXPO_PUBLIC_SENTRY_DSN が未設定の場合は Sentry を無効化(enabled: false)して初期化する。
 * これによりローカル開発やDSN未設定のビルドでもエラーなく動作する。
 */

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/**
 * コーチAPI(プロキシ)へのリクエストかどうかを判定する。
 * 会話テキスト・ヒアリング回答等が乗るため、該当リクエストはペイロードを除去する。
 * エンドポイント追加時の漏れを防ぐため、ベースURL設定時はその配下を一律で対象にする。
 */
export function isCoachApiUrl(url: string | undefined): boolean {
  if (!url) return false;
  // ベースURLが設定されていれば、コーチAPI配下の全エンドポイントを対象にする
  if (Config.coachApiUrl && url.startsWith(Config.coachApiUrl)) return true;
  // フォールバック: 既知のエンドポイントをパスパターンで判定する
  return /\/v1\/(coach|plan|suggest)(\?|\/|$)/.test(url);
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
