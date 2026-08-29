/** アプリ⇔プロキシ間のAPI型定義(proxy/src/index.ts と対応) */

import type { InsightContent, InsightStats } from '@/lib/insight-stats';
import type { NextWeekPace } from '@/lib/pace';

/** 現在地ヒアリングの回答1件(質問文と選んだチップの文言) */
export type HearingPair = { question: string; answer: string };

export type PlanRequest = {
  goalTitle: string;
  why: string;
  /** 目標カテゴリ(GoalCategory の enum値) */
  category?: string;
  /** 達成期間(月数)。旧クライアント互換。durationWeeks があればそちらを優先 */
  durationMonths?: number;
  /** 達成期間(週数)。週次ペース配分の逆算に使う */
  durationWeeks?: number;
  /** 現在地ヒアリングの回答。最初の週の負荷調整に使う(サーバーには保存されない) */
  hearingAnswers?: HearingPair[];
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
  /**
   * 道のりの全体図(全期間のフェーズ概要)。週番号は1-basedで両端を含む。
   * 旧プロキシは返さないため optional(無ければクライアントは従来どおり動く)
   */
  milestones?: { fromWeek: number; toWeek: number; title: string }[];
};

/** 週次リプランに送る前週の実績統計(端末内集計の数値のみ) */
export type ReplanStats = {
  /** 前週に歩いた日数(チェックあり提出) */
  walkedDays: number;
  /** 前週に報告のみだった日数(チェック0件提出) */
  reportedDays: number;
  /** 前週のおやすみ救済日数 */
  graceDays: number;
  /** 現在の連続日数 */
  streakCurrent: number;
};

/**
 * 週次リプラン(/v1/replan)のリクエスト。
 * サーバーへ送ってよいのは goalTitle / why / category / AI自身が生成した行動文言 / 数値統計のみ。
 * ユーザーが自分で追加したcustomタスクの文言・会話・ヒアリング回答は絶対に含めない
 * (prevActions の組み立ては lib/replan.ts の collectPrevActions に一本化)
 */
export type ReplanRequest = {
  goalTitle: string;
  why: string;
  /** 目標カテゴリ(GoalCategory の enum値) */
  category?: string;
  /** 計画対象の週番号(1-based) */
  nextWeekNo: number;
  /** 前週のフォーカステーマ(AI生成) */
  prevFocus: string;
  /** 前週の毎日の行動文言(AI生成系 daily_actions 由来のみ・最大7件) */
  prevActions: string[];
  /** 前週の実績統計 */
  stats: ReplanStats;
  /** 来週の歩幅宣言(旗の日セレモニーの3択。未宣言は keep) */
  pace: NextWeekPace;
  /** 達成期間の全週数(ペース配分の参考。不明なら省略) */
  totalWeeks?: number;
};

/** 週次リプランのレスポンス */
export type ReplanResponse = {
  /** 次週のフォーカステーマ(1つ) */
  nextWeekFocus: string;
  /** 次週7日分の最小行動。dayOffset は目標開始日からのオフセット */
  dailyActions: { dayOffset: number; description: string }[];
  /** 「なぜこの計画にしたか」の手紙(3文以内)。プレミアムのみ観察手帳に表示する */
  flagMessage: string;
};

export type CoachContext = {
  goalTitle: string;
  why: string;
  /** 目標カテゴリ(GoalCategory の enum値)。カテゴリ別の定石をプロンプトに反映する */
  category?: string;
  /** 今週のフォーカステーマ(AIが生成した計画から特定。該当週がなければ省略) */
  weeklyFocus?: string;
  /** 今日のタスク一覧(タイトルと完了状態のみ) */
  todayTasks?: { title: string; done: boolean }[];
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

/** 期間おすすめ(/v1/suggest)のリクエスト */
export type SuggestRequest = {
  goalTitle: string;
  /** 目標カテゴリ(GoalCategory の enum値) */
  category?: string;
  /** 現在地ヒアリングの回答(サーバーには保存されない) */
  hearingAnswers?: HearingPair[];
};

/** 期間おすすめのレスポンス。weeks は 2〜104 に丸め済み */
export type SuggestResponse = {
  weeks: number;
  /** おすすめ理由(ホトリの口調・2文以内) */
  reason: string;
};

/**
 * 観察手帳(/v1/insight)のリクエスト。
 * 端末内で集計した統計値(数値+カテゴリenum)のみで構成する。
 * タスク名・目標タイトル・会話・ヒアリング回答などの自由テキストは絶対に含めない。
 */
export type InsightRequest = InsightStats & {
  /** 観察対象の週番号(1-based) */
  weekNo: number;
  /** 目標カテゴリ(GoalCategory の enum値のみ。自由入力は不可) */
  category?: string;
};

/** 観察手帳のレスポンス(総評・タイプ名・曜日解説・作戦) */
export type InsightResponse = InsightContent;

export class AiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'offline' | 'rate_limited' | 'server' | 'timeout',
  ) {
    super(message);
    this.name = 'AiError';
  }
}
