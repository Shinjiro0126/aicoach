# coach-proxy

AI目標コーチアプリのAPIプロキシ(Cloudflare Workers)。APIキーの隠蔽・システムプロンプトの注入・レート制限・危機ワード検知を担当する。DBは不要。

## エンドポイント

| Path | 用途 | モデル |
|---|---|---|
| `POST /v1/plan` | 目標→週次プラン+7日分の行動に分解(構造化JSON出力) | claude-sonnet-5 |
| `POST /v1/coach` | コーチ対話(3文以内の応答) | claude-haiku-4-5 |

すべてのリクエストに `x-app-token`(共有トークン)と `x-device-id` ヘッダが必要。

## デプロイ手順

```sh
cd proxy
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # Claude APIキー
npx wrangler secret put APP_TOKEN           # 任意のランダム文字列
npx wrangler deploy
```

デプロイ後、アプリ側の `.env` に設定:

```
EXPO_PUBLIC_COACH_API_URL=https://coach-proxy.<your-subdomain>.workers.dev
EXPO_PUBLIC_COACH_APP_TOKEN=<APP_TOKENと同じ値>
```

## レート制限(任意)

デバイス毎の日次ハードリミット(200回/日)を有効にするにはKVを作成して `wrangler.toml` のコメントを解除:

```sh
npx wrangler kv namespace create RATE_KV
```

## ローカル開発

```sh
npx wrangler dev
# .dev.vars に ANTHROPIC_API_KEY / APP_TOKEN を書いておく
```

## コスト試算(目安)

- コーチ対話: haiku 4.5 ($1/$5 per MTok)。1対話 ≈ 入力1.5K + 出力150トークン ≈ $0.0022
- 目標分解: sonnet-5 ($3/$15)。1回 ≈ 入力1K + 出力800トークン ≈ $0.015
- DAU 300人 × 3対話/日 → 月額 ≈ $60。無料枠10回/日+サーバー側200回/日で暴走を抑止。
