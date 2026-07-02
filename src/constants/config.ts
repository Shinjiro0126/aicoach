/**
 * アプリ全体の設定値。
 * EXPO_PUBLIC_COACH_API_URL が未設定の場合、AIクライアントはモック応答にフォールバックする(開発用)。
 */
export const Config = {
  /** Cloudflare Workers プロキシのベースURL(例: https://coach.example.workers.dev) */
  coachApiUrl: process.env.EXPO_PUBLIC_COACH_API_URL ?? '',
  /** プロキシへ送る簡易アプリトークン(プロキシ側 APP_TOKEN と一致させる) */
  coachAppToken: process.env.EXPO_PUBLIC_COACH_APP_TOKEN ?? '',
  /** 無料プランの1日あたりAI対話回数 */
  freeDailyMessageLimit: 10,
  /** AI応答のタイムアウト(ms) */
  aiTimeoutMs: 30_000,
  /** コーチに送る直近履歴の件数 */
  coachHistoryLimit: 12,
  /** 通知のデフォルト時刻 */
  defaultMorningTime: { hour: 8, minute: 0 },
  defaultEveningTime: { hour: 21, minute: 30 },
} as const;
