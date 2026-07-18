import Anthropic from '@anthropic-ai/sdk';

import { COACH_SYSTEM, CRISIS_KEYWORDS, CRISIS_RESPONSE, PLAN_SYSTEM, SUGGEST_SYSTEM } from './prompts';

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string;
  /** 任意: デバイス毎の日次レート制限に使うKV */
  RATE_KV?: KVNamespace;
}

const COACH_MODEL = 'claude-haiku-4-5';
const PLAN_MODEL = 'claude-sonnet-5';
/** 期間おすすめは軽量な提案なので高速・低コストのモデルを使う */
const SUGGEST_MODEL = 'claude-haiku-4-5';
/** 期間おすすめの週数の許容範囲(クライアントのステッパーと同じ 2週〜2年) */
const MIN_SUGGEST_WEEKS = 2;
const MAX_SUGGEST_WEEKS = 104;
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

/** 現在地ヒアリングの回答1件。中継のみでどこにも保存しない */
type HearingPair = { question: string; answer: string };

type PlanRequest = {
  goalTitle: string;
  why: string;
  /** 目標カテゴリ(クライアントの GoalCategory enum値) */
  category?: string;
  /** 達成期間(月数)。旧クライアント互換 */
  durationMonths?: number;
  /** 達成期間(週数)。あれば月数より優先 */
  durationWeeks?: number;
  /** 現在地ヒアリングの回答 */
  hearingAnswers?: HearingPair[];
  targetDate?: string;
  startDate: string;
};

type SuggestRequest = {
  goalTitle: string;
  category?: string;
  hearingAnswers?: HearingPair[];
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
    context.mode === 'reflection'
      ? `モード: 振り返り(「今日の記録」への1言目は褒め+受領で完結し、質問で返さない)`
      : `モード: 通常対話`,
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

/** ヒアリング回答をプロンプト用のブロックに整形する(なければ空文字) */
function hearingBlock(pairs: HearingPair[] | undefined): string {
  if (!pairs || pairs.length === 0) return '';
  const lines = pairs.map((p) => `- ${p.question} → ${p.answer}`).join('\n');
  return `現在地(本人へのヒアリング回答):\n${lines}\nこの現在地に合わせて、最初の週の行動を確実に続けられる軽さに調整する`;
}

async function handlePlan(env: Env, client: Anthropic, req: PlanRequest): Promise<Response> {
  const categoryLabel = req.category ? CATEGORY_LABELS[req.category] : undefined;
  const weeks = req.durationWeeks;
  const months = req.durationMonths;
  const prompt = [
    `以下の目標を計画に分解してください。`,
    `目標: ${req.goalTitle}`,
    categoryLabel ? `カテゴリ: ${categoryLabel}` : '',
    `動機: ${req.why}`,
    weeks
      ? `達成期間: ${weeks}週間。この期間から逆算したペース配分で、最初の4週間のフォーカスを設計する`
      : months
        ? `達成期間: ${months}ヶ月(約${Math.round(months * 4.33)}週間)。この期間から逆算したペース配分で、最初の4週間のフォーカスを設計する`
        : '',
    hearingBlock(req.hearingAnswers),
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

const SUGGEST_SCHEMA = {
  type: 'object',
  properties: {
    weeks: { type: 'integer' },
    reason: { type: 'string' },
  },
  required: ['weeks', 'reason'],
  additionalProperties: false,
} as const;

/** 目標+ヒアリング回答から達成期間(週数)と理由を提案する */
async function handleSuggest(env: Env, client: Anthropic, req: SuggestRequest): Promise<Response> {
  const categoryLabel = req.category ? CATEGORY_LABELS[req.category] : undefined;
  const prompt = [
    `以下の目標に対して、おすすめの達成期間(週数)と理由を提案してください。`,
    `目標: ${req.goalTitle}`,
    categoryLabel ? `カテゴリ: ${categoryLabel}` : '',
    hearingBlock(req.hearingAnswers),
  ]
    .filter(Boolean)
    .join('\n');

  const message = await client.messages.create({
    model: SUGGEST_MODEL,
    max_tokens: 512,
    system: SUGGEST_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SUGGEST_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  if (message.stop_reason === 'refusal') {
    return json({ error: 'suggest_refused' }, 422);
  }
  const parsed = JSON.parse(extractText(message)) as { weeks: number; reason: string };
  // 週数はクライアントのステッパー範囲(2〜104週)に丸めてから返す
  const weeks = Math.min(
    MAX_SUGGEST_WEEKS,
    Math.max(MIN_SUGGEST_WEEKS, Math.round(Number(parsed.weeks) || 0)),
  );
  return json({ weeks, reason: parsed.reason });
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
      if (url.pathname === '/v1/suggest') {
        return await handleSuggest(env, client, (await request.json()) as SuggestRequest);
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'upstream_rate_limited' }, 429);
      if (e instanceof Anthropic.APIError) return json({ error: 'upstream_error' }, 502);
      return json({ error: 'internal_error' }, 500);
    }
  },
};
