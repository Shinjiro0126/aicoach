import Anthropic from '@anthropic-ai/sdk';

import { COACH_SYSTEM, CRISIS_KEYWORDS, CRISIS_RESPONSE, PLAN_SYSTEM } from './prompts';

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string;
  /** 任意: デバイス毎の日次レート制限に使うKV */
  RATE_KV?: KVNamespace;
}

const COACH_MODEL = 'claude-haiku-4-5';
const PLAN_MODEL = 'claude-sonnet-5';
/** 不正利用対策のサーバー側ハードリミット(デバイス毎/日)。クライアント側の無料枠とは別 */
const HARD_DAILY_LIMIT = 200;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type CoachRequest = {
  context: {
    goalTitle: string;
    why: string;
    recentDays: { date: string; done: boolean; description: string }[];
    streak: number;
    mode: 'chat' | 'reflection';
  };
  messages: ChatMessage[];
};

type PlanRequest = {
  goalTitle: string;
  why: string;
  /** 目標カテゴリ(クライアントの GoalCategory enum値) */
  category?: string;
  /** 達成期間(月数) */
  durationMonths?: number;
  targetDate?: string;
  startDate: string;
};

/** クライアントの GoalCategory enum値 → プロンプト用の日本語ラベル */
const CATEGORY_LABELS: Record<string, string> = {
  health: '健康・生活習慣',
  training: 'トレーニング',
  career: 'ビジネス・キャリア',
  learning: '学習・資格',
  money: 'お金・貯蓄',
  other: 'その他',
};

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    weeklyFocus: { type: 'array', items: { type: 'string' } },
    dailyActions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dayOffset: { type: 'integer' },
          description: { type: 'string' },
        },
        required: ['dayOffset', 'description'],
        additionalProperties: false,
      },
    },
    welcomeMessage: { type: 'string' },
  },
  required: ['weeklyFocus', 'dailyActions', 'welcomeMessage'],
  additionalProperties: false,
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function checkRateLimit(env: Env, deviceId: string): Promise<boolean> {
  if (!env.RATE_KV) return true;
  const today = new Date().toISOString().slice(0, 10);
  const key = `rl:${deviceId}:${today}`;
  const used = Number((await env.RATE_KV.get(key)) ?? '0');
  if (used >= HARD_DAILY_LIMIT) return false;
  await env.RATE_KV.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return true;
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

async function handleCoach(env: Env, client: Anthropic, req: CoachRequest): Promise<Response> {
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
  if (lastUser && CRISIS_KEYWORDS.some((k) => lastUser.content.includes(k))) {
    return json({ reply: CRISIS_RESPONSE });
  }

  const { context } = req;
  const recent = context.recentDays
    .map((d) => `${d.date}: ${d.done ? '達成' : '未達成'} (${d.description})`)
    .join('\n');
  const contextBlock = [
    `# ユーザーの状況`,
    `目標: ${context.goalTitle}`,
    `動機: ${context.why}`,
    `現在のストリーク: ${context.streak}日`,
    `直近の記録:\n${recent || '(まだ記録なし)'}`,
    context.mode === 'reflection' ? `モード: 夜の振り返り(簡略GROWで対話する)` : `モード: 通常対話`,
  ].join('\n');

  const history: Anthropic.MessageParam[] = req.messages.slice(-12).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  // Messages APIは user 開始が必須。履歴が assistant 始まりならコンテキストのみのuserターンを先頭に置く
  const messages: Anthropic.MessageParam[] =
    history[0]?.role === 'user'
      ? [{ role: 'user', content: `${contextBlock}\n\n---\n\n${(history[0].content as string) ?? ''}` }, ...history.slice(1)]
      : [{ role: 'user', content: contextBlock }, ...history];

  const message = await client.messages.create({
    model: COACH_MODEL,
    max_tokens: 512,
    system: COACH_SYSTEM,
    messages,
  });
  return json({ reply: extractText(message).trim() });
}

async function handlePlan(env: Env, client: Anthropic, req: PlanRequest): Promise<Response> {
  const categoryLabel = req.category ? CATEGORY_LABELS[req.category] : undefined;
  const months = req.durationMonths;
  const prompt = [
    `以下の目標を計画に分解してください。`,
    `目標: ${req.goalTitle}`,
    categoryLabel ? `カテゴリ: ${categoryLabel}` : '',
    `動機: ${req.why}`,
    months
      ? `達成期間: ${months}ヶ月(約${Math.round(months * 4.33)}週間)。この期間から逆算したペース配分で、最初の4週間のフォーカスを設計する`
      : '',
    req.targetDate ? `目標期日: ${req.targetDate}` : '',
    `開始日: ${req.startDate}`,
  ]
    .filter(Boolean)
    .join('\n');

  const message = await client.messages.create({
    model: PLAN_MODEL,
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    system: PLAN_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  if (message.stop_reason === 'refusal') {
    return json({ error: 'plan_refused' }, 422);
  }
  return new Response(extractText(message), {
    headers: { 'content-type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    if (request.headers.get('x-app-token') !== env.APP_TOKEN) {
      return json({ error: 'unauthorized' }, 401);
    }
    const deviceId = request.headers.get('x-device-id') ?? 'unknown';
    if (!(await checkRateLimit(env, deviceId))) {
      return json({ error: 'rate_limited' }, 429);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const url = new URL(request.url);

    try {
      if (url.pathname === '/v1/coach') {
        return await handleCoach(env, client, (await request.json()) as CoachRequest);
      }
      if (url.pathname === '/v1/plan') {
        return await handlePlan(env, client, (await request.json()) as PlanRequest);
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'upstream_rate_limited' }, 429);
      if (e instanceof Anthropic.APIError) return json({ error: 'upstream_error' }, 502);
      return json({ error: 'internal_error' }, 500);
    }
  },
};
