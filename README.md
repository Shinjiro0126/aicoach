# ホトリ — 三日坊主で終わらせない目標達成アプリ

AIコーチ「ホトリ」が目標を毎日の小さな行動に分解し、朝のリマインドと夜の振り返り対話で達成まで伴走するiOSアプリ。目標・行動記録・対話履歴などのデータはすべて端末内(SQLite)に保存され、サーバーには残らない。匿名のクラッシュ情報・利用状況データ(後述)のみ外部サービスへ送信する。

## 構成

```
src/
  app/            Expo Router 画面 ((tabs)/, onboarding/, paywall)
  components/     UIコンポーネント (ui/ = Button, Card, Chip, Screen)
  db/             expo-sqlite + Drizzle (schema / migrations / repo)
  lib/            ドメインロジック (streak, quota, dates)、AIクライアント、observability(Sentry)、analytics(PostHog)
  stores/         Zustand (app = 永続設定, onboarding = 一時)
proxy/            Cloudflare Workers AIプロキシ (Claude API, 別デプロイ)
```

- **AI接続**: アプリ → `proxy/`(APIキー隠蔽・プロンプト注入・レート制限)→ Claude API。`EXPO_PUBLIC_COACH_API_URL` 未設定時はモック応答で全機能が動く。
- **モデル**: 対話 = claude-haiku-4-5 / 目標分解 = claude-sonnet-5(構造化JSON出力)
- **課金**: フリーミアム(無料は AI対話 10回/日)。RevenueCat接続は TODO(`src/app/paywall.tsx`)。

## クラッシュ検知・行動分析(Sentry / PostHog)

- **Sentry**(`src/lib/observability/sentry.ts`): `EXPO_PUBLIC_SENTRY_DSN` が未設定の場合は無効化(`enabled: false`)されて初期化されるので、DSNなしでも通常どおり動作する。`beforeBreadcrumb` / `beforeSend` でコーチAPI(`/v1/coach`, `/v1/plan`)へのリクエスト/レスポンス本文(ユーザー発言・AI返答などの会話テキスト)を除去してから送信する。スタックトレースやエラーメッセージ自体は送信対象。
  - `app.json` の `@sentry/react-native/expo` プラグインの `organization` / `project` は仮のプレースホルダ。実際のSentryプロジェクト作成後に置き換えること。
- **PostHog**(`src/lib/analytics/posthog.ts`): `EXPO_PUBLIC_POSTHOG_API_KEY` が未設定の場合は no-op スタブになる。オートキャプチャ・セッションリプレイ・アプリライフサイクルイベントの自動記録は明示的に無効化しており、`trackEvent()` で明示的に発火した以下のイベントのみ送信する(自由記述の目標名・動機・チャット本文はプロパティに含めない)。
  - `onboarding_started` / `onboarding_completed` / `ai_plan_generated` / `coach_message_sent`(件数のみ)/ `streak_achieved`(streakCountのみ)/ `paywall_viewed` / `quota_exceeded`
  - distinct_id には `src/stores/app.ts` の匿名 `deviceId` を使用する。
- 設定画面(`src/app/(tabs)/settings.tsx`)にこれらの匿名データ送信についての説明文を表示している(常時ON、個人情報や会話内容は送信しない)。

## 開発

```sh
npm install
npm start            # Expo Go (iPhoneのExpo Goアプリで開く)
npm test             # ユニットテスト (streak / quota / dates)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

AIを実際に動かす場合は [proxy/README.md](proxy/README.md) の手順でデプロイし、`.env` を作成([.env.example](.env.example) 参照)。Sentry / PostHog も同様に `.env` へキーを設定すれば有効化される(未設定でも動作する)。

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
