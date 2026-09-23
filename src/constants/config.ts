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
  /**
   * プレミアムの1日あたりAI対話回数(ソフトリミット)。
   * UIに残数カウンタは出さないが、使い切ると無料枠と同じく翌日まで送信不可になる。
   * プロキシ側ハードリミット(proxy/src/index.ts の HARD_DAILY_LIMIT)より小さくしておくこと
   */
  premiumDailyMessageLimit: 100,
  /**
   * RevenueCat の iOS 用公開APIキー。
   * 未設定(またはExpo Goなどネイティブモジュール不在)の場合、課金は「未接続モード」になり
   * ペイウォール・復元は従来どおり準備中の案内を出す(coachApiUrl のモックフォールバックと同じ思想)
   */
  revenueCatIosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '',
  /** AI応答のタイムアウト(ms) */
  aiTimeoutMs: 30_000,
  /** コーチに送る直近履歴の件数 */
  coachHistoryLimit: 12,
  /** 通知のデフォルト時刻 */
  defaultMorningTime: { hour: 8, minute: 0 },
  defaultEveningTime: { hour: 21, minute: 30 },
  /**
   * 利用規約・プライバシーポリシーのURL(原本は legal/ ディレクトリ。
   * Cloudflare Pages プロジェクト hotori-legal にデプロイして公開する)。
   * リリースビルドの前に必ずデプロイ済みであること
   */
  termsOfUseUrl: 'https://hotori-legal.pages.dev/terms',
  privacyPolicyUrl: 'https://hotori-legal.pages.dev/privacy',
} as const;
