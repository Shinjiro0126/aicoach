# AIコーチ — 三日坊主で終わらせない目標達成アプリ

AIコーチが目標を毎日の小さな行動に分解し、朝のリマインドと夜の振り返り対話で達成まで伴走するiOSアプリ。データはすべて端末内(SQLite)に保存され、サーバーには残らない。

## 構成

```
src/
  app/            Expo Router 画面 ((tabs)/, onboarding/, paywall)
  components/     UIコンポーネント (ui/ = Button, Card, Chip, Screen)
  db/             expo-sqlite + Drizzle (schema / migrations / repo)
  lib/            ドメインロジック (streak, quota, dates) と AIクライアント
  stores/         Zustand (app = 永続設定, onboarding = 一時)
proxy/            Cloudflare Workers AIプロキシ (Claude API, 別デプロイ)
```

- **AI接続**: アプリ → `proxy/`(APIキー隠蔽・プロンプト注入・レート制限)→ Claude API。`EXPO_PUBLIC_COACH_API_URL` 未設定時はモック応答で全機能が動く。
- **モデル**: 対話 = claude-haiku-4-5 / 目標分解 = claude-sonnet-5(構造化JSON出力)
- **課金**: フリーミアム(無料は AI対話 10回/日)。RevenueCat接続は TODO(`src/app/paywall.tsx`)。

## 開発

```sh
npm install
npm start            # Expo Go (iPhoneのExpo Goアプリで開く)
npm test             # ユニットテスト (streak / quota / dates)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

AIを実際に動かす場合は [proxy/README.md](proxy/README.md) の手順でデプロイし、`.env` を作成([.env.example](.env.example) 参照)。

## リリース(EAS)

```sh
npx eas init                 # 初回のみ (Expoアカウント必要)
npx eas build --platform ios # TestFlight向けビルド
npx eas submit --platform ios
```

`app.json` の `ios.bundleIdentifier`(現在 `dev.shinji.aicoach`)は Apple Developer の App ID に合わせて変更すること。

## 設計メモ

- ストリークは「1日だけの抜けは救済(7日に1回まで)」ルール([src/lib/streak.ts](src/lib/streak.ts))。仕様はテストが正とする。
- 日付はすべて端末ローカルの `YYYY-MM-DD` キー([src/lib/dates.ts](src/lib/dates.ts))。
- DBマイグレーションは `PRAGMA user_version` 管理の手書きSQL([src/db/migrations.ts](src/db/migrations.ts))。スキーマ変更は配列末尾に追加。
- 危機ワード検知・医療誘導はプロキシ側([proxy/src/prompts.ts](proxy/src/prompts.ts))。App Store審査対策も兼ねるため削除しないこと。

開発計画の全体像(リサーチ〜1万DLグロース戦略)は `~/.claude/plans/ai-plan-react-snuggly-dragon.md` を参照。
