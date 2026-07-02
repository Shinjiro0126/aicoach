/** ローカル専用の一意ID(サーバー同期しないため衝突耐性はこれで十分) */
export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
