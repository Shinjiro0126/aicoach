# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# AIコーチアプリ (このリポジトリについて)

AIが目標達成に伴走するiOSアプリ。React Native + Expo SDK 57 + TypeScript + Expo Router。ローカル保存中心(DBサーバーなし)、AIはCloudflare Workersプロキシ経由でClaude APIを呼ぶ。

## コマンド

- `npm test` — Jest ユニットテスト(`src/lib/__tests__/`)。単一テスト: `npx jest streak`
- `npm run typecheck` — `tsc --noEmit`(`proxy/` は除外。プロキシは `cd proxy && npx tsc --noEmit`)
- `npm run lint` — `expo lint`(react-compiler ルール有効。effect内の同期setStateは弾かれる)
- `npm start` — Expo Go で起動。iOSビルドは EAS(`npx eas build --platform ios`)
- Jest は jest-expo を使わない(RN 0.86 とのpeer衝突のため)。babel-jest + babel-preset-expo 直接構成。依存追加時に衝突したら `--legacy-peer-deps`

## アーキテクチャ

- **画面**: `src/app/` — `(tabs)/` (今日/コーチ/記録/設定)、`onboarding/`(目標→動機→通知→AI計画生成)、`paywall.tsx`(modal)。アクティブ目標が無ければ `(tabs)/_layout.tsx` が `/onboarding` へリダイレクト
- **データ層**: `src/db/` — expo-sqlite + Drizzle。マイグレーションは `migrations.ts` の手書きSQL配列(PRAGMA user_version 管理、**末尾追加のみ**)。画面からは必ず `repo.ts` の関数経由でアクセス
- **ドメインロジック**: `src/lib/` — streak(1日抜け救済ルール)/ quota(無料枠10回/日)/ dates(ローカルTZの YYYY-MM-DD キー)。すべて純関数でテスト済み。**仕様変更はテストとセットで**
- **AI**: `src/lib/ai/client.ts` → `proxy/`(Workers)→ Claude API。`EXPO_PUBLIC_COACH_API_URL` 未設定ならモック(`mock.ts`)にフォールバック。システムプロンプトは**プロキシ側のみ**(`proxy/src/prompts.ts`)、クライアントに置かない
- **状態**: `src/stores/app.ts`(Zustand + AsyncStorage永続。設定・無料枠・deviceId)。DBが正のデータ(目標等)はストアにキャッシュのみ
- **可観測性**: `src/lib/observability/sentry.ts`(クラッシュ検知、`EXPO_PUBLIC_SENTRY_DSN` 未設定なら無効化)、`src/lib/analytics/posthog.ts`(行動分析、`EXPO_PUBLIC_POSTHOG_API_KEY` 未設定ならno-op)。両方とも `EXPO_PUBLIC_COACH_API_URL` 未設定時にモックへフォールバックするのと同じ思想

## 制約・注意

- 危機ワード検知と相談窓口案内(`proxy/src/prompts.ts`)はApp Store審査対応を兼ねる。削除・迂回しない
- 「データは端末内のみ」がプロダクトの訴求点。対話履歴等をサーバーに保存する変更はしない。ただし匿名のクラッシュ情報・利用状況データ(会話内容・PIIは含まない)のみ Sentry / PostHog に送信している。会話テキストを送る変更は厳禁(`sentry.ts` の `beforeBreadcrumb`/`beforeSend` でコーチAPIペイロードを除去、`posthog.ts` の `trackEvent` は決められたイベント名・プロパティのみ)
- コーチ応答は3文以内ルール(プロンプトで制御)。UIもそれを前提に設計されている
