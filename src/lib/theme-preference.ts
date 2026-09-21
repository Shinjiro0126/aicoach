/**
 * 外観(テーマ)設定の解決ロジック。
 * ユーザーの選択(システムに合わせる / ライト / ダーク)と OS のカラースキームから、
 * 実際に適用するテーマを決める純関数。フックや画面からはこの関数経由で解決する
 */

/** ユーザーが設定画面で選ぶ外観。'system' は OS 設定に追従する */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * 実効テーマを解決する。
 * - 'light' / 'dark' 固定なら OS 設定に関わらずその値
 * - 'system' なら OS のカラースキームに追従。OS が dark 以外
 *   (light・unspecified・null・undefined)はすべて light 扱い(既存UIの挙動と同じ)
 */
export function resolveColorScheme(
  preference: ThemePreference,
  systemScheme: string | null | undefined,
): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}
