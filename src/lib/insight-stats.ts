import { addDaysKey, diffDays } from './dates';
import type { StreakResult } from './streak';

/**
 * 記録タブv2「ホトリの観察手帳」の集計純関数。
 * daily_reports の提出記録から、端末内だけで統計値を組み立てる。
 *
 * プライバシー上の要:
 * /v1/insight へ送ってよいのはここで計算した統計値(数値+カテゴリenum)のみ。
 * タスク名・目標タイトル・会話・ヒアリング回答は絶対に含めない。
 */

/** 提出記録1件の最小情報(repo.listReports の戻り値と構造互換) */
export type ReportEntry = {
  dateKey: string;
  /** 提出時刻(epoch ms)。時間帯分布に使う */
  submittedAt: number;
  doneCount: number;
};

export type TimeBands = {
  /** 朝: 5時〜11時 */
  morning: number;
  /** 昼: 11時〜17時 */
  midday: number;
  /** 夜: 17時〜翌5時 */
  night: number;
};

export type InsightStats = {
  /** 曜日別提出数(日〜土の7要素、直近3週=21日) */
  weekdayCounts: number[];
  /** 記録時間帯の分布(全期間) */
  timeBands: TimeBands;
  /** 止まった回数(提出が1日以上抜けた回数。今日に続く抜けは2日以上たってから数える) */
  stops: number;
  /** 止まった翌日に戻ってきた回数(抜けがちょうど1日で復帰した回数) */
  nextDayReturns: number;
  /** 歩いた日数(チェック1件以上の提出日、全期間) */
  walkedDays: number;
  /** 報告した日数(チェック0件の提出日、全期間) */
  zeroReportDays: number;
  streakCurrent: number;
  streakBest: number;
  /** おやすみ救済が使われた日数(現在のストリーク内) */
  graceDays: number;
  /** 観察日数(初提出日から今日まで。提出0件なら0) */
  observedDays: number;
};

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 手帳が書けるようになる観察日数(2週間) */
export const MIN_INSIGHT_DAYS = 14;

/** 観察手帳AIの待ち時間上限(超えたらフォールバック文へ。期間おすすめと同じ思想) */
export const INSIGHT_TIMEOUT_MS = 12_000;

/** 曜日別集計の対象期間(直近3週) */
const WEEKDAY_WINDOW_DAYS = 21;

function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}

function timeBandOf(submittedAt: number): keyof TimeBands {
  const hour = new Date(submittedAt).getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'midday';
  return 'night';
}

export const TIME_BAND_LABELS: Record<keyof TimeBands, string> = {
  morning: '朝',
  midday: '昼',
  night: '夜',
};

/** 提出記録+ストリークから観察手帳の統計値を計算する */
export function computeInsightStats(
  reports: readonly ReportEntry[],
  today: string,
  streak: StreakResult,
): InsightStats {
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  const timeBands: TimeBands = { morning: 0, midday: 0, night: 0 };
  let walkedDays = 0;
  let zeroReportDays = 0;

  for (const report of reports) {
    const ago = diffDays(report.dateKey, today);
    if (ago >= 0 && ago < WEEKDAY_WINDOW_DAYS) {
      weekdayCounts[weekdayOf(report.dateKey)] += 1;
    }
    timeBands[timeBandOf(report.submittedAt)] += 1;
    if (report.doneCount > 0) walkedDays += 1;
    else zeroReportDays += 1;
  }

  // 復帰統計: 提出日を昇順に並べ、抜け(ギャップ)ごとに「止まった1回」と数える。
  // 抜けがちょうど1日なら「翌日に復帰した」。今日に続く抜けは、まだ今日提出できる可能性が
  // あるため、2日以上たってから「止まった(未復帰)」として数える
  const sorted = [...new Set(reports.map((r) => r.dateKey))].sort();
  let stops = 0;
  let nextDayReturns = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = diffDays(sorted[i - 1], sorted[i]) - 1;
    if (gap >= 1) {
      stops += 1;
      if (gap === 1) nextDayReturns += 1;
    }
  }
  if (sorted.length > 0) {
    const trailingGap = diffDays(sorted[sorted.length - 1], today) - 1;
    if (trailingGap >= 2) stops += 1;
  }

  const observedDays = sorted.length > 0 ? diffDays(sorted[0], today) + 1 : 0;

  return {
    weekdayCounts,
    timeBands,
    stops,
    nextDayReturns,
    walkedDays,
    zeroReportDays,
    streakCurrent: streak.current,
    streakBest: streak.best,
    graceDays: streak.graceUsedOn.length,
    observedDays,
  };
}

/** 最大値のindexを返す。最大が複数ある(同数タイ)場合は -1 */
function uniqueMaxIndex(values: readonly number[]): number {
  let maxIndex = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[maxIndex]) maxIndex = i;
  }
  const count = values.filter((v) => v === values[maxIndex]).length;
  return count === 1 ? maxIndex : -1;
}

/** 記録時間帯の最多バンド(タイ・全0なら null) */
export function maxTimeBand(bands: TimeBands): keyof TimeBands | null {
  const keys: (keyof TimeBands)[] = ['morning', 'midday', 'night'];
  const values = keys.map((k) => bands[k]);
  if (values.every((v) => v === 0)) return null;
  const index = uniqueMaxIndex(values);
  return index >= 0 ? keys[index] : null;
}

/**
 * 無料ティザー1行のローカル生成(AI不使用・決定的)。
 * 断定は確定事実(提出数・復帰回数)のみ。データ2週未満は「観察中」文を返す。
 */
export function buildTeaser(stats: InsightStats): string {
  if (stats.observedDays < MIN_INSIGHT_DAYS) {
    return '観察中です。ホトリはいま、あなたの歩き方を見ています。';
  }

  // 1) 最強曜日(直近3週で3回以上・単独最多)
  const wd = uniqueMaxIndex(stats.weekdayCounts);
  if (wd >= 0 && stats.weekdayCounts[wd] >= 3) {
    const label = WEEKDAY_LABELS[wd];
    return `あなたは${label}曜に強い。直近3週、${label}曜の歩みがいちばん確かです。`;
  }

  // 2) 復帰力(止まった全回で翌日復帰)
  if (stats.stops > 0 && stats.nextDayReturns === stats.stops) {
    return stats.stops === 1
      ? '一度止まりましたが、翌日には戻りました。その復帰力が、あなたの強さです。'
      : `止まった${stats.stops}回、すべて翌日に戻りました。その復帰力が、あなたの強さです。`;
  }

  // 3) 記録の時間帯(単独最多)
  const band = maxTimeBand(stats.timeBands);
  if (band) {
    const label = TIME_BAND_LABELS[band];
    return `あなたの記録は${label}に集まっています。${label}が、あなたの歩く時間です。`;
  }

  return `歩いた日${stats.walkedDays}日。あなたの道のりは、確かに積み上がっています。`;
}

/** 観察手帳のAI応答(クライアント⇔プロキシ共通の形。ai/types.ts から再エクスポートされる) */
export type InsightContent = {
  /** 手紙風の総評(3文以内・断定調) */
  letter: string;
  /** 歩き方タイプ名(15字以内) */
  typeName: string;
  /** 曜日別データの解説文 */
  weekdayNote: string;
  /** 来週の作戦文 */
  plan: string;
};

/**
 * 観察手帳のフォールバック文生成(AI失敗・タイムアウト・モック時)。
 * 断定は確定事実のみ・傾向は「〜の傾向があります」・予測は作戦形、のルールで定型に組み立てる。
 */
export function buildInsightFallback(stats: InsightStats): InsightContent {
  // ---- 総評(手紙・3文) ----
  const s1 =
    stats.observedDays > 0
      ? `${stats.observedDays}日間、あなたの歩き方を見てきました。`
      : 'これから、あなたの歩き方を見ていきます。';
  let s2: string;
  if (stats.stops > 0 && stats.nextDayReturns === stats.stops) {
    s2 = `止まった${stats.stops}回すべてで翌日に戻る歩き方は、私の経験でいちばん伸びる型です。`;
  } else if (stats.stops === 0 && stats.walkedDays > 0) {
    s2 = `ここまで${stats.walkedDays}日歩き、まだ一度も止まっていません。`;
  } else {
    s2 = `歩いた日は${stats.walkedDays}日、その記録は確かにここに残っています。`;
  }
  const s3 = '来週も、いまの歩幅のままで十分です。';
  const letter = `${s1}${s2}${s3}`;

  // ---- タイプ名(15字以内) ----
  const band = maxTimeBand(stats.timeBands);
  const typeName =
    band === 'morning'
      ? '朝に歩く、堅実な歩き手'
      : band === 'midday'
        ? '昼に進む、堅実な歩き手'
        : band === 'night'
          ? '夜に整える、堅実な歩き手'
          : stats.walkedDays > 0
            ? '一歩を積む、堅実な歩き手'
            : 'これからの歩き手';

  // ---- 曜日解説(事実+傾向) ----
  const wd = uniqueMaxIndex(stats.weekdayCounts);
  const maxCount = wd >= 0 ? stats.weekdayCounts[wd] : 0;
  let weekdayNote: string;
  if (wd >= 0 && maxCount >= 2) {
    const label = WEEKDAY_LABELS[wd];
    weekdayNote = `直近3週は${label}曜の提出が${maxCount}回で最多です。${label}曜に歩みが乗る傾向があります。`;
  } else if (stats.weekdayCounts.every((v) => v === 0)) {
    weekdayNote = '直近3週の提出はまだ少なく、曜日の傾向はこれから見えてきます。';
  } else {
    weekdayNote = '曜日の偏りは、まだ大きくありません。どの曜日も同じ歩幅で歩けています。';
  }

  // ---- 来週の作戦(作戦形) ----
  let plan: string;
  if (wd >= 0 && maxCount >= 2) {
    let minIndex = 0;
    for (let i = 1; i < stats.weekdayCounts.length; i += 1) {
      if (stats.weekdayCounts[i] < stats.weekdayCounts[minIndex]) minIndex = i;
    }
    plan =
      minIndex === wd
        ? '来週も、最初の一歩を小さく保ちます。歩幅を変えるのは、その先で十分です。'
        : `来週は${WEEKDAY_LABELS[minIndex]}曜の一歩を5分版に軽くします。${WEEKDAY_LABELS[wd]}曜の勢いは、そのまま活かします。`;
  } else {
    plan = '来週も、最初の一歩を小さく保ちます。歩幅を変えるのは、その先で十分です。';
  }

  return { letter, typeName: typeName.slice(0, 15), weekdayNote, plan };
}

/** 復帰力カードの本文(分母ゼロは「まだ一度も止まっていません」系の代替文) */
export function comebackText(stats: InsightStats): string {
  if (stats.stops === 0) {
    return 'まだ一度も止まっていません。このまま歩幅を守りましょう。';
  }
  if (stats.nextDayReturns === stats.stops) {
    return `止まった${stats.stops}回、すべて翌日に戻りました。この復帰力があれば、道のりは途切れません。`;
  }
  return `止まった${stats.stops}回のうち、${stats.nextDayReturns}回は翌日に戻りました。戻れた事実が、次の一歩を支えます。`;
}

/** 初提出日(観察の起点)。提出が1件も無ければ null */
export function firstReportDateKey(reports: readonly ReportEntry[]): string | null {
  let first: string | null = null;
  for (const report of reports) {
    if (first === null || report.dateKey < first) first = report.dateKey;
  }
  return first;
}

// ===== 手帳の更新スケジュール(週の旗の日=週次更新日) =====

export type NotebookSchedule = {
  /** 生成可能な最新の手帳の週番号(データ2週未満なら 0) */
  availableWeekNo: number;
  /** 最初の手帳まであとN日(生成可能になったら 0) */
  daysToFirst: number;
  /** 次の手帳まであとN日(未生成可能の間は daysToFirst と同じ) */
  daysToNext: number;
  /** 最新の手帳の旗の日(YYYY-MM-DD)。まだなら null */
  latestFlagDateKey: string | null;
};

/**
 * 「次の手帳まであとN日」の計算。
 * 「データ2週」の基準は初提出日(=stats.observedDays と同じ起点)に統一する。
 * 目標開始日基準にすると、開始から日が経ってから記録を始めたユーザーで
 * 「観察日数は2週未満なのに手帳が書ける/あと0日表示」の矛盾が生じるため(Issue #30)。
 * 観察の週は初提出日起点の7日区切りで、旗の日=各週の最終日。
 * 最初の手帳はデータ2週(MIN_INSIGHT_DAYS)がそろった日=観察第2週の旗の日に書ける。
 */
export function notebookSchedule(firstReportKey: string | null, today: string): NotebookSchedule {
  // まだ一度も提出していない=観察は始まっていない。最初の手帳まで丸2週間
  if (firstReportKey === null) {
    return {
      availableWeekNo: 0,
      daysToFirst: MIN_INSIGHT_DAYS,
      daysToNext: MIN_INSIGHT_DAYS,
      latestFlagDateKey: null,
    };
  }
  const days = Math.max(0, diffDays(firstReportKey, today));
  const weekNo = Math.floor((days + 1) / 7);
  const available = days >= MIN_INSIGHT_DAYS - 1 ? weekNo : 0;
  const daysToFirst = available > 0 ? 0 : MIN_INSIGHT_DAYS - 1 - days;
  return {
    availableWeekNo: available,
    daysToFirst,
    daysToNext: available > 0 ? (available + 1) * 7 - 1 - days : daysToFirst,
    latestFlagDateKey: available > 0 ? addDaysKey(firstReportKey, available * 7 - 1) : null,
  };
}

// ===== 手帳の生成要否判定 =====

/** 生成判定に必要な最小のキャッシュ情報(ストアの InsightCacheEntry と構造互換) */
export type InsightCacheRef = {
  goalId: string;
  weekNo: number;
  /** フォールバック文で保存された応答か */
  fallback: boolean;
};

export type InsightGenerationPlan = {
  /** 新規生成(または再生成)を始めるべきか */
  generate: boolean;
  /** フォールバック保存週の静かな再生成か(再失敗時は表示中の文を上書きしない) */
  retryFallback: boolean;
};

/**
 * 観察手帳の生成要否判定(notebook.tsx の生成effectとテストで共有する純関数)。
 * 画面を開いたまま週の旗の日を跨いで availableWeekNo が進んだ場合も、
 * キャッシュ週との不一致として「生成が必要」と判定される(Issue #31)。
 * - データ2週未満(availableWeekNo=0)は観察中で、生成しない
 * - キャッシュが現行週と不一致(週が進んだ・目標が変わった・キャッシュ無し)なら新規生成
 * - フォールバック文で保存された週は、次に開いたとき静かに再生成を試みる
 */
export function insightGenerationPlan(
  cache: InsightCacheRef | null,
  goalId: string,
  availableWeekNo: number,
): InsightGenerationPlan {
  if (availableWeekNo === 0) return { generate: false, retryFallback: false };
  if (cache === null || cache.goalId !== goalId || cache.weekNo !== availableWeekNo) {
    return { generate: true, retryFallback: false };
  }
  return cache.fallback
    ? { generate: true, retryFallback: true }
    : { generate: false, retryFallback: false };
}

// ===== 飛び石の道のり(journey-stones)用の日別データ =====

export type JourneyDayState = 'walked' | 'reported' | 'grace' | 'missed' | 'future';

export type JourneyDay = {
  dateKey: string;
  state: JourneyDayState;
  isToday: boolean;
};

function dayState(
  reportMap: Map<string, number>,
  graceSet: ReadonlySet<string>,
  dateKey: string,
): Exclude<JourneyDayState, 'future'> {
  const doneCount = reportMap.get(dateKey);
  if (doneCount !== undefined) return doneCount > 0 ? 'walked' : 'reported';
  if (graceSet.has(dateKey)) return 'grace';
  return 'missed';
}

/** 直近 count 日(古い順、今日が末尾)の飛び石データ */
export function journeyDays(
  reports: readonly ReportEntry[],
  graceUsedOn: readonly string[],
  today: string,
  count = 14,
): JourneyDay[] {
  const reportMap = new Map(reports.map((r) => [r.dateKey, r.doneCount]));
  const graceSet = new Set(graceUsedOn);
  return Array.from({ length: count }, (_, i) => {
    const dateKey = addDaysKey(today, i - (count - 1));
    return { dateKey, state: dayState(reportMap, graceSet, dateKey), isToday: i === count - 1 };
  });
}

/**
 * コールドスタート(記録2週未満)用: 現在週7日分の飛び石データ。
 * 今日より先の日は 'future'(点線の石)になる
 */
export function coldStartJourneyDays(
  startKey: string,
  reports: readonly ReportEntry[],
  graceUsedOn: readonly string[],
  today: string,
): JourneyDay[] {
  const reportMap = new Map(reports.map((r) => [r.dateKey, r.doneCount]));
  const graceSet = new Set(graceUsedOn);
  const days = Math.max(0, diffDays(startKey, today));
  const weekStart = addDaysKey(startKey, days - (days % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const dateKey = addDaysKey(weekStart, i);
    const isFuture = diffDays(today, dateKey) > 0;
    return {
      dateKey,
      state: isFuture ? 'future' : dayState(reportMap, graceSet, dateKey),
      isToday: dateKey === today,
    };
  });
}

/** 飛び石SVGの accessibilityLabel 用の要約文 */
export function journeySummaryLabel(days: readonly JourneyDay[], weekNo: number, daysToFlag: number): string {
  const walked = days.filter((d) => d.state === 'walked').length;
  const reported = days.filter((d) => d.state === 'reported').length;
  const grace = days.filter((d) => d.state === 'grace').length;
  // コールドスタートは未来日(点線の石)を含むため「直近N日」と言わず「今週」と読む
  const range = days.some((d) => d.state === 'future') ? '今週' : `直近${days.length}日`;
  return `${range}: 歩いた日${walked}、報告した日${reported}、おやすみ${grace}。第${weekNo}週の旗まであと${daysToFlag}日`;
}
