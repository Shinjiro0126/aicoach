/** アプリ⇔プロキシ間のAPI型定義(proxy/src/index.ts と対応) */

export type PlanRequest = {
  goalTitle: string;
  why: string;
  /** 目標カテゴリ(GoalCategory の enum値) */
  category?: string;
  /** 達成期間(月数)。週次ペース配分の逆算に使う */
  durationMonths?: number;
  targetDate?: string;
  /** 開始日(YYYY-MM-DD)。初日の行動はこの日付から生成される */
  startDate: string;
};

export type PlanResponse = {
  /** 週ごとのフォーカステーマ(4週分) */
  weeklyFocus: string[];
  /** 最初の7日分の最小行動。dayOffset は startDate からのオフセット */
  dailyActions: { dayOffset: number; description: string }[];
  /** コーチからの初回メッセージ */
  welcomeMessage: string;
};

export type CoachContext = {
  goalTitle: string;
  why: string;
  /** 直近7日の達成状況 */
  recentDays: { date: string; done: boolean; description: string }[];
  /** 現在のストリーク */
  streak: number;
  /** 振り返りモードかどうか(夜の振り返りフロー) */
  mode: 'chat' | 'reflection';
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type CoachRequest = {
  context: CoachContext;
  messages: ChatMessage[];
};

export type CoachResponse = {
  reply: string;
};

export class AiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'offline' | 'rate_limited' | 'server' | 'timeout',
  ) {
    super(message);
    this.name = 'AiError';
  }
}
