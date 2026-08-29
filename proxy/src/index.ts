import Anthropic from '@anthropic-ai/sdk';

import {
  categoryPlaybookSection,
  COACH_SYSTEM,
  CRISIS_KEYWORDS,
  CRISIS_RESPONSE,
  INSIGHT_SYSTEM,
  PLAN_SYSTEM,
  REPLAN_SYSTEM,
  SUGGEST_SYSTEM,
} from './prompts';

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
/** 観察手帳は統計値からの短文生成なので高速・低コストのモデルを使う */
const INSIGHT_MODEL = 'claude-haiku-4-5';
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
    /** 目標カテゴリ(クライアントの GoalCategory enum値)。旧クライアントは送らない */
    category?: string;
    /** 今週のフォーカステーマ(AI生成計画由来)。旧クライアントは送らない */
    weeklyFocus?: string;
    /** 今日のタスク一覧(タイトルと完了状態のみ)。旧クライアントは送らない */
    todayTasks?: { title: string; done: boolean }[];
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

/**
 * 週次リプラン(/v1/replan)のリクエスト。中継のみでどこにも保存しない。
 * prevFocus / prevActions はAI自身が過去に生成した文言のみ(クライアント側で
 * ユーザー追加のcustomタスク・会話・ヒアリング回答を含めない契約)。
 * stats は端末内で集計された数値のみで、handleReplan で clampStat により正規化する
 */
type ReplanRequest = {
  goalTitle: string;
  why: string;
  category?: string;
  /** 計画対象の週番号(1-based) */
  nextWeekNo: number;
  /** 前週のフォーカステーマ(AI生成) */
  prevFocus: string;
  /** 前週の毎日の行動文言(AI生成系のみ・最大7件) */
  prevActions: string[];
  /** 前週の実績統計(数値のみ) */
  stats: { walkedDays: number; reportedDays: number; graceDays: number; streakCurrent: number };
  /** 来週の歩幅宣言(旗の日セレモニーの3択) */
  pace: 'keep' | 'lighter' | 'wider';
  /** 達成期間の全週数(あればペース配分の参考にする) */
  totalWeeks?: number;
};

/**
 * 観察手帳のリクエスト。端末内で集計された統計値のみを受け取る。
 * 自由テキストフィールドは持たない(handleInsight で数値・既知enumに正規化してからプロンプトに載せる)
 */
type InsightRequest = {
  category?: string;
  weekNo: number;
  /** 曜日別提出数(日〜土の7要素、直近3週) */
  weekdayCounts: number[];
  timeBands: { morning: number; midday: number; night: number };
  stops: number;
  nextDayReturns: number;
  walkedDays: number;
  zeroReportDays: number;
  streakCurrent: number;
  streakBest: number;
  graceDays: number;
  observedDays: number;
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
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fromWeek: { type: 'integer' },
          toWeek: { type: 'integer' },
          title: { type: 'string' },
        },
        required: ['fromWeek', 'toWeek', 'title'],
        additionalProperties: false,
      },
    },
  },
  required: ['weeklyFocus', 'dailyActions', 'welcomeMessage', 'milestones'],
  additionalProperties: false,
} as const;

/** 道のりの全体図の1フェーズ(週番号は1-based・両端を含む) */
type Milestone = { fromWeek: number; toWeek: number; title: string };

/**
 * milestones の安全弁: 週番号を 1〜maxWeek の整数に丸め、from > to や
 * タイトルが空の要素は捨てる。配列でない・有効要素が無い場合は undefined
 * (クライアントは milestones 無しの従来動作にフォールバックする)
 */
function sanitizeMilestones(value: unknown, maxWeek: number): Milestone[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((m): Milestone | undefined => {
      if (typeof m !== 'object' || m === null) return undefined;
      const rec = m as Record<string, unknown>;
      if (typeof rec.title !== 'string') return undefined;
      const title = rec.title.trim().slice(0, 30);
      if (!title) return undefined;
      const fromWeek = Math.max(1, clampStat(rec.fromWeek, maxWeek));
      const toWeek = Math.max(1, clampStat(rec.toWeek, maxWeek));
      if (toWeek < fromWeek) return undefined;
      return { fromWeek, toWeek, title };
    })
    .filter((m): m is Milestone => m !== undefined)
    .sort((a, b) => a.fromWeek - b.fromWeek);
  return items.length > 0 ? items : undefined;
}

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
  // 追加コンテキスト(カテゴリ・今週のフォーカス・今日のタスク)は値があるときのみ行を出す(旧クライアント互換)
  const categoryLabel = context.category ? CATEGORY_LABELS[context.category] : undefined;
  const todayTasks =
    context.todayTasks && context.todayTasks.length > 0
      ? `今日のタスク: ${context.todayTasks.map((t) => `「${t.title}(${t.done ? '済' : '未'})」`).join('、')}`
      : '';
  const contextBlock = [
    `# ユーザーの状況`,
    `目標: ${context.goalTitle}`,
    categoryLabel ? `カテゴリ: ${categoryLabel}` : '',
    `動機: ${context.why}`,
    context.weeklyFocus ? `今週のフォーカス: ${context.weeklyFocus}` : '',
    todayTasks,
    `現在のストリーク: ${context.streak}日`,
    `直近の記録:\n${recent || '(まだ記録なし)'}`,
    context.mode === 'reflection'
      ? `モード: 振り返り(「今日の記録」への1言目は褒め+受領で完結し、質問で返さない)`
      : `モード: 通常対話`,
  ]
    .filter(Boolean)
    .join('\n');

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
    // 512では振り返りの1言目など長めの応答が文の途中で打ち切られることがあった。
    // 実質の上限は3文ルール(プロンプト)で、この値は安全弁(課金は生成した分のみ)
    max_tokens: 1024,
    // カテゴリが分かる場合は分野別の定石を連結する(未知・未指定なら空文字で無変化)
    system: COACH_SYSTEM + categoryPlaybookSection(context.category),
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
    // カテゴリが分かる場合は分野別の定石を連結する(未知・未指定なら空文字で無変化)
    system: PLAN_SYSTEM + categoryPlaybookSection(req.category),
    output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  if (message.stop_reason === 'refusal') {
    return json({ error: 'plan_refused' }, 422);
  }
  const raw = extractText(message);
  // milestones の週番号をサーバー側でクランプしてから返す(それ以外は生成結果をそのまま中継)。
  // 万一パースできない場合は従来どおり生成結果をそのまま返す
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // 達成期間が分かればその週数を上限に、不明・不正値なら 200 を上限にする
    const totalWeeks = clampStat(weeks ?? (months ? months * 4.33 : 0), 200);
    const milestones = sanitizeMilestones(parsed.milestones, totalWeeks > 0 ? totalWeeks : 200);
    if (milestones) {
      parsed.milestones = milestones;
    } else {
      delete parsed.milestones;
    }
    return json(parsed);
  } catch {
    return new Response(raw, {
      headers: { 'content-type': 'application/json' },
    });
  }
}

const REPLAN_SCHEMA = {
  type: 'object',
  properties: {
    nextWeekFocus: { type: 'string' },
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
    flagMessage: { type: 'string' },
  },
  required: ['nextWeekFocus', 'dailyActions', 'flagMessage'],
  additionalProperties: false,
} as const;

/** 歩幅宣言のenum → プロンプト用の日本語ラベル(未知値は keep 扱い) */
const PACE_LABELS: Record<'keep' | 'lighter' | 'wider', string> = {
  keep: 'この歩幅のまま',
  lighter: '少し軽くする',
  wider: '少し広げる',
};

/**
 * 週次リプラン: 前週の実績と歩幅宣言から、次週のフォーカス1つ+7日分の最小行動を生成する。
 * prevActions は文字列のみ・最大7件に正規化し、stats は clampStat で数値に丸めてからプロンプトに載せる
 */
async function handleReplan(env: Env, client: Anthropic, req: ReplanRequest): Promise<Response> {
  const categoryLabel = req.category ? CATEGORY_LABELS[req.category] : undefined;
  const nextWeekNo = Math.max(1, clampStat(req.nextWeekNo, 200));
  const pace: keyof typeof PACE_LABELS =
    req.pace === 'lighter' || req.pace === 'wider' ? req.pace : 'keep';
  const stats = req.stats ?? { walkedDays: 0, reportedDays: 0, graceDays: 0, streakCurrent: 0 };
  const prevActions = (Array.isArray(req.prevActions) ? req.prevActions : [])
    .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    .slice(0, 7);
  const prevFocus = typeof req.prevFocus === 'string' ? req.prevFocus : '';
  const totalWeeks = req.totalWeeks ? clampStat(req.totalWeeks, 200) : 0;
  // dayOffset は目標開始日からのオフセット。次週初日 = (nextWeekNo - 1) * 7
  const baseOffset = (nextWeekNo - 1) * 7;

  const prompt = [
    `第${nextWeekNo}週(次週)の計画を作ってください。`,
    `目標: ${req.goalTitle}`,
    categoryLabel ? `カテゴリ: ${categoryLabel}` : '',
    `動機: ${req.why}`,
    totalWeeks > 0 ? `達成期間: 全${totalWeeks}週間(いま第${nextWeekNo}週に入るところ)` : '',
    prevFocus ? `前週のフォーカス: ${prevFocus}` : '',
    prevActions.length > 0 ? `前週の毎日の行動:\n${prevActions.map((a) => `- ${a}`).join('\n')}` : '',
    `前週の実績: 歩いた日${clampStat(stats.walkedDays, 7)}日 / 報告のみの日${clampStat(stats.reportedDays, 7)}日 / おやすみ${clampStat(stats.graceDays, 7)}日 / 現在の連続日数${clampStat(stats.streakCurrent)}日`,
    `本人の歩幅宣言: ${PACE_LABELS[pace]}`,
    `dailyActions は7件、dayOffset は ${baseOffset}(次週初日)から ${baseOffset + 6} までの連番にする`,
  ]
    .filter(Boolean)
    .join('\n');

  const message = await client.messages.create({
    model: PLAN_MODEL,
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    // カテゴリが分かる場合は分野別の定石を連結する(未知・未指定なら空文字で無変化)
    system: REPLAN_SYSTEM + categoryPlaybookSection(req.category),
    output_config: { format: { type: 'json_schema', schema: REPLAN_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  if (message.stop_reason === 'refusal') {
    return json({ error: 'replan_refused' }, 422);
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

const INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    letter: { type: 'string' },
    typeName: { type: 'string' },
    weekdayNote: { type: 'string' },
    plan: { type: 'string' },
  },
  required: ['letter', 'typeName', 'weekdayNote', 'plan'],
  additionalProperties: false,
} as const;

/** 統計値の安全弁: 数値以外・範囲外は丸める(プロンプトに数値以外を載せないため) */
function clampStat(value: unknown, max = 9999): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, n));
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 端末内で集計された統計値から観察手帳(総評・タイプ名・曜日解説・作戦)を生成する。
 * リクエストの各フィールドは数値へ正規化し、カテゴリは既知enumのラベルのみ採用する。
 * 自由テキストがプロンプトへ流れる経路は存在しない
 */
async function handleInsight(env: Env, client: Anthropic, req: InsightRequest): Promise<Response> {
  const categoryLabel = req.category ? CATEGORY_LABELS[req.category] : undefined;
  const weekdayCounts = Array.from({ length: 7 }, (_, i) =>
    clampStat(Array.isArray(req.weekdayCounts) ? req.weekdayCounts[i] : 0),
  );
  const bands = req.timeBands ?? { morning: 0, midday: 0, night: 0 };
  const stops = clampStat(req.stops);
  const nextDayReturns = Math.min(clampStat(req.nextDayReturns), stops);

  const prompt = [
    `以下の統計値から、第${clampStat(req.weekNo, 200)}週の観察手帳を書いてください。`,
    categoryLabel ? `目標カテゴリ: ${categoryLabel}` : '',
    `観察日数: ${clampStat(req.observedDays)}日`,
    `曜日別の提出数(直近3週): ${weekdayCounts.map((n, i) => `${WEEKDAY_LABELS[i]}${n}回`).join(' ')}`,
    `記録の時間帯: 朝${clampStat(bands.morning)}回 / 昼${clampStat(bands.midday)}回 / 夜${clampStat(bands.night)}回`,
    `止まった回数: ${stops}回 / うち翌日に復帰: ${nextDayReturns}回`,
    `歩いた日数(チェックあり提出): ${clampStat(req.walkedDays)}日 / 報告のみの日(チェック0件提出): ${clampStat(req.zeroReportDays)}日`,
    `現在の連続日数: ${clampStat(req.streakCurrent)}日 / 自己ベスト: ${clampStat(req.streakBest)}日 / おやすみ救済: ${clampStat(req.graceDays)}回`,
  ]
    .filter(Boolean)
    .join('\n');

  const message = await client.messages.create({
    model: INSIGHT_MODEL,
    max_tokens: 768,
    system: INSIGHT_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: INSIGHT_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  if (message.stop_reason === 'refusal') {
    return json({ error: 'insight_refused' }, 422);
  }
  const parsed = JSON.parse(extractText(message)) as {
    letter: string;
    typeName: string;
    weekdayNote: string;
    plan: string;
  };
  // typeName はバッジ表示のため15文字で切り詰めて返す
  return json({
    letter: parsed.letter,
    typeName: (parsed.typeName ?? '').slice(0, 15),
    weekdayNote: parsed.weekdayNote,
    plan: parsed.plan,
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
      if (url.pathname === '/v1/replan') {
        return await handleReplan(env, client, (await request.json()) as ReplanRequest);
      }
      if (url.pathname === '/v1/suggest') {
        return await handleSuggest(env, client, (await request.json()) as SuggestRequest);
      }
      if (url.pathname === '/v1/insight') {
        return await handleInsight(env, client, (await request.json()) as InsightRequest);
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'upstream_rate_limited' }, 429);
      if (e instanceof Anthropic.APIError) return json({ error: 'upstream_error' }, 502);
      return json({ error: 'internal_error' }, 500);
    }
  },
};
