import { addDaysKey, diffDays } from './dates';
import { weekIndex } from './roadmap';

/**
 * ホームv2の進捗計算(すべて純関数)。
 * 日付は端末ローカルの YYYY-MM-DD キー(dates.ts と同じ規約)。
 *
 * 設計方針(行動経済学に沿う):
 * - 授かり進捗効果: 全体進捗は開始時点で+5%から始め、0%を見せない
 * - スモールエリア原則: 50%を境に「ここまで歩いた」(序盤)/「残り」(終盤)へコピーを切り替える
 * - 目標勾配効果: 主役は「今週の旗まで」の日ドット(数日で満タンになる近接ゴール)
 */

/** 準備完了ボーナス(オンボーディング完了時点の初期進捗) */
export const HEAD_START_PERCENT = 5;

export type ProgressSummary = {
  /** 全体進捗率(5〜100の整数) */
  percent: number;
  /** 歩いた日数(今日を含む。開始日=1日目) */
  elapsedDays: number;
  /** ゴールまでの残り日数(0以上) */
  remainingDays: number;
  /** 序盤(50%未満)か終盤(50%以上)か */
  phase: 'early' | 'late';
  /** 主コピー: 序盤「ここまでN日分、歩きました」/ 終盤「ゴールまで、あとN日」 */
  copyMain: string;
  /** 副コピー: 序盤「全体のX%地点」/ 終盤「X%地点」 */
  copySub: string;
};

/**
 * 全体進捗のサマリー。percent は +5% の授かり進捗込み。
 * today が期間外でも 5〜100 にクランプする。
 */
export function progressSummary(startKey: string, targetKey: string, today: string): ProgressSummary {
  const totalDays = Math.max(1, diffDays(startKey, targetKey));
  const walked = Math.min(Math.max(0, diffDays(startKey, today)), totalDays);
  const percent = Math.min(100, Math.round(HEAD_START_PERCENT + (walked / totalDays) * (100 - HEAD_START_PERCENT)));
  const elapsedDays = walked + 1;
  const remainingDays = Math.max(0, totalDays - walked);
  const phase: ProgressSummary['phase'] = percent < 50 ? 'early' : 'late';
  return {
    percent,
    elapsedDays,
    remainingDays,
    phase,
    copyMain: phase === 'early' ? `ここまで${elapsedDays}日分、歩きました` : `ゴールまで、あと${remainingDays}日`,
    copySub: phase === 'early' ? `全体の${percent}%地点` : `${percent}%地点`,
  };
}

export type WeekDot = {
  dateKey: string;
  /** その日が記録(提出)済みか */
  done: boolean;
  isToday: boolean;
};

export type WeekFlagInfo = {
  /** 現在の週番号(1-based、クランプなし) */
  weekNo: number;
  /** 今日の週内index(0〜6) */
  dayIndex: number;
  /** 今週7日分のドット(週の初日=開始日と同じ曜日起点) */
  dots: WeekDot[];
  /** 今週の記録日数 */
  doneCount: number;
  /** 今週の旗までの残り日数(今日を含む) */
  daysToFlag: number;
};

/**
 * 「今週の旗まで」の日ドット計算。週は目標の開始日を起点に7日区切り。
 * recordDates には提出済み日付キー(listReportDates)を渡す。
 */
export function weekFlagInfo(startKey: string, today: string, recordDates: readonly string[]): WeekFlagInfo {
  const recorded = new Set(recordDates);
  const days = Math.max(0, diffDays(startKey, today));
  const dayIndex = days % 7;
  const weekNo = Math.floor(days / 7) + 1;
  const dots: WeekDot[] = Array.from({ length: 7 }, (_, i) => {
    const offset = days - dayIndex + i;
    const dateKey = addDaysKey(startKey, offset);
    return { dateKey, done: recorded.has(dateKey), isToday: i === dayIndex };
  });
  return {
    weekNo,
    dayIndex,
    dots,
    doneCount: dots.filter((d) => d.done).length,
    daysToFlag: 7 - dayIndex,
  };
}

export type WeekSegments = {
  /** 全体の週数(最低1) */
  total: number;
  /** 現在の週index(0-based、total-1でクランプ) */
  currentIndex: number;
  /** 現在週の進み(0〜1。週内の経過日数/7) */
  fraction: number;
};

/** 全体の週セグメントバー(脇役)。13週なら13分割で、経過週=done、現在週=部分塗り */
export function weekSegments(startKey: string, targetKey: string, today: string): WeekSegments {
  const totalDays = Math.max(1, diffDays(startKey, targetKey));
  const total = Math.max(1, Math.ceil(totalDays / 7));
  const rawIndex = weekIndex(startKey, today);
  const currentIndex = Math.min(rawIndex, total - 1);
  const dayIndex = Math.max(0, diffDays(startKey, today)) % 7;
  const past = rawIndex > total - 1;
  return { total, currentIndex, fraction: past ? 1 : Math.min(1, (dayIndex + 1) / 7) };
}
