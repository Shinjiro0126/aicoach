import { Config } from '@/constants/config';
import { buildInsightFallback, INSIGHT_TIMEOUT_MS } from '@/lib/insight-stats';
import { clampWeeks } from '@/lib/roadmap';
import { mockCoach, mockInsight, mockPlan, mockReplan, mockSuggest } from './mock';
import { fallbackSuggestion, SUGGEST_TIMEOUT_MS, withTimeout } from './suggest-fallback';
import {
  AiError,
  type CoachRequest,
  type CoachResponse,
  type InsightRequest,
  type InsightResponse,
  type PlanRequest,
  type PlanResponse,
  type ReplanRequest,
  type ReplanResponse,
  type SuggestRequest,
  type SuggestResponse,
} from './types';

function isMockMode(): boolean {
  return !Config.coachApiUrl;
}

async function post<T>(path: string, body: unknown, deviceId: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Config.aiTimeoutMs);
  let res: Response;
  try {
    res = await fetch(`${Config.coachApiUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-app-token': Config.coachAppToken,
        'x-device-id': deviceId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError('timeout', 'timeout');
    throw new AiError('network error', 'offline');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new AiError('rate limited', 'rate_limited');
  if (!res.ok) throw new AiError(`server error ${res.status}`, 'server');
  return (await res.json()) as T;
}

/** 目標をAIで週次プラン+7日分の行動に分解する */
export async function generatePlan(req: PlanRequest, deviceId: string): Promise<PlanResponse> {
  if (isMockMode()) return mockPlan(req);
  return post<PlanResponse>('/v1/plan', req, deviceId);
}

/**
 * 週次リプラン(/v1/replan)。旗の日セレモニーから週1回・無料で呼ぶ。
 * 対話クォータ(canSendAiMessage)は消費しない(プロキシ側レート制限のみ)。
 * 失敗時のフォールバック(何もしない=前日コピー)は呼び出し側で扱う
 */
export async function replanWeek(req: ReplanRequest, deviceId: string): Promise<ReplanResponse> {
  if (isMockMode()) return mockReplan(req);
  return post<ReplanResponse>('/v1/replan', req, deviceId);
}

/** コーチ対話(1往復) */
export async function chatWithCoach(req: CoachRequest, deviceId: string): Promise<CoachResponse> {
  if (isMockMode()) return mockCoach(req);
  return post<CoachResponse>('/v1/coach', req, deviceId);
}

/**
 * 達成期間のおすすめ(週数+理由)。
 * 無料枠(1日10回の対話クォータ)のカウント対象にはしない(プロキシ側レート制限のみ)。
 */
export async function suggestDuration(req: SuggestRequest, deviceId: string): Promise<SuggestResponse> {
  if (isMockMode()) return mockSuggest(req);
  return post<SuggestResponse>('/v1/suggest', req, deviceId);
}

/**
 * 達成期間のおすすめ(フォールバック保証つき)。reject しない。
 * 失敗・6秒タイムアウト時はカテゴリ別の決定的な見立てに切り替えて、
 * 成功時と同じ形で必ず解決する(「おすすめは必ず出す」方針)。
 */
export async function suggestDurationWithFallback(
  req: SuggestRequest,
  deviceId: string,
): Promise<SuggestResponse> {
  try {
    const res = await withTimeout(suggestDuration(req, deviceId), SUGGEST_TIMEOUT_MS);
    return { weeks: clampWeeks(res.weeks), reason: res.reason };
  } catch {
    return fallbackSuggestion(req.category, req.goalTitle);
  }
}

/**
 * 観察手帳の生成(/v1/insight)。送るのは端末内で集計した統計値のみ。
 * プレミアム専用機能のため、無料枠(quota)は消費しない
 */
export async function generateInsight(req: InsightRequest, deviceId: string): Promise<InsightResponse> {
  if (isMockMode()) return mockInsight(req);
  return post<InsightResponse>('/v1/insight', req, deviceId);
}

export type InsightResult = {
  insight: InsightResponse;
  /** フォールバック文で組み立てた応答か(後で再生成を試みる判定に使う) */
  fallback: boolean;
};

/**
 * 観察手帳の生成(フォールバック保証つき)。reject しない。
 * 失敗・タイムアウト時は統計値からの定型文に切り替えて必ず結果を返す
 * (期間おすすめ suggestDurationWithFallback と同じ思想)。
 */
export async function generateInsightWithFallback(
  req: InsightRequest,
  deviceId: string,
): Promise<InsightResult> {
  const fallback = buildInsightFallback(req);
  try {
    const res = await withTimeout(generateInsight(req, deviceId), INSIGHT_TIMEOUT_MS);
    // 応答のフィールド欠け・空文字はフォールバック文で補う(画面に空欄を出さない)
    return {
      insight: {
        letter: res.letter?.trim() || fallback.letter,
        typeName: (res.typeName?.trim() || fallback.typeName).slice(0, 15),
        weekdayNote: res.weekdayNote?.trim() || fallback.weekdayNote,
        plan: res.plan?.trim() || fallback.plan,
      },
      fallback: false,
    };
  } catch {
    return { insight: fallback, fallback: true };
  }
}
