/**
 * 起動時ブランドローディング画面(LaunchOverlay)の表示状態を決める純関数。
 * 「アプリの準備完了」と「最小表示時間の経過」の両方を満たしたときだけ閉じてよい。
 * 準備が先に終わっても最小時間まで表示を保持してチラつきを防ぎ、
 * 準備が遅い場合はタイムアウトで強制的に閉じずそのまま待つ。
 */

/** オーバーレイの最小表示時間(ms)。ネイティブスプラッシュからの「一呼吸」 */
export const LAUNCH_MIN_VISIBLE_MS = 800;

export type LaunchGateInput = {
  /** アプリ本体の準備(目標の読み込み等)が完了したか */
  ready: boolean;
  /** オーバーレイ表示開始からの経過時間(ms) */
  elapsedMs: number;
  /** 最小表示時間(ms)。省略時は LAUNCH_MIN_VISIBLE_MS */
  minVisibleMs?: number;
};

/** オーバーレイを閉じて(フェードアウトして)よいか */
export function shouldDismissLaunchOverlay({
  ready,
  elapsedMs,
  minVisibleMs = LAUNCH_MIN_VISIBLE_MS,
}: LaunchGateInput): boolean {
  return ready && elapsedMs >= minVisibleMs;
}

/** 最小表示時間までの残り時間(ms)。既に満たしていれば 0 */
export function minVisibleRemainingMs(
  elapsedMs: number,
  minVisibleMs: number = LAUNCH_MIN_VISIBLE_MS,
): number {
  return Math.max(0, minVisibleMs - elapsedMs);
}
