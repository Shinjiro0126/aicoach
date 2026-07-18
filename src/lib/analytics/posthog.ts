import PostHog from 'posthog-react-native';

/**
 * 行動分析(PostHog)。
 *
 * `src/lib/ai/client.ts` が API URL 未設定時にモックへフォールバックするのと同じ思想で、
 * EXPO_PUBLIC_POSTHOG_API_KEY が未設定の場合は no-op スタブとして振る舞う(clientを作らない)。
 *
 * オートキャプチャ(画面遷移・タップの自動記録)・セッションリプレイ・アプリライフサイクルイベントは、
 * 行動の生データや画面内容を送信しないため明示的に無効化している。
 * 送信するのは呼び出し側が明示的に発火する、あらかじめ決められたイベント名のみ。
 */

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '';
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

/** 送信を許可するイベント名。自由記述(目標名・動機・チャット本文等)はどのイベントにも含めない */
export const AnalyticsEvent = {
  OnboardingStarted: 'onboarding_started',
  /** プロパティ: category(src/constants/categories.ts の GoalCategory enum値のみ。自由入力は送らない) */
  CategorySelected: 'category_selected',
  OnboardingCompleted: 'onboarding_completed',
  AiPlanGenerated: 'ai_plan_generated',
  CoachMessageSent: 'coach_message_sent',
  /**
   * プロパティ: streakCount, doneCount(いずれも数値のみ)。
   * ホームv2以降は「提出」時に発火する(doneCount=0 の提出でも発火)。分析側は doneCount で達成/0件提出を区別する
   */
  StreakAchieved: 'streak_achieved',
  PaywallViewed: 'paywall_viewed',
  QuotaExceeded: 'quota_exceeded',
} as const;

export type EventProperties = Record<string, string | number | boolean>;

let client: PostHog | null = null;

/** deviceId(匿名ID)でPostHogクライアントを初期化する。APIキー未設定なら何もしない(no-op) */
export function initPostHog(deviceId: string): void {
  if (!apiKey) return;

  if (!client) {
    client = new PostHog(apiKey, {
      host,
      // 画面遷移・タップ等の自動記録は行わない
      captureAppLifecycleEvents: false,
      // セッションリプレイ(画面録画)は行わない
      enableSessionReplay: false,
      bootstrap: { distinctId: deviceId },
    });
    return;
  }

  // deviceId が変わった場合(初期化タイミングの都合で発生しうる)は識別を更新する
  if (client.getDistinctId() !== deviceId) {
    client.identify(deviceId);
  }
}

/** 決められたイベント名のみを送るための薄いラッパー。プロパティに自由記述を含めないこと */
export function trackEvent(name: string, properties?: EventProperties): void {
  if (!client) return;
  client.capture(name, properties);
}
