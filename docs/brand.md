# ホトリ — ブランド定義書

決定日: 2026-07-15 / ブランドリデザイン: 2026-07-18 / キャラデザインv2「コーチ姿」: 2026-07-31

## 名前の由来

「ホトリ」は、水辺の「畔(ほとり)」から。
すぐそばにあるけれど、こちらに踏み込んでこない場所。コーチAIの立ち位置そのものを名前にした。

## カラーパレット — 「水辺ブルー」

グリーン系から水辺ブルーへ刷新(2026-07-18)。トークンは `src/constants/theme.ts` に定義。

| トークン | ライト | ダーク | 用途 |
| --- | --- | --- | --- |
| `tint` | `#2E9FD6` 水辺ブルー | `#5FC2EE` 月夜ブルー | 主色。ボタン・アクティブ状態 |
| `tintDeep` | `#17638F` 深瀬ブルー | `#8FD4F4` | 威厳・見出し・強調テキスト |
| `tintSoft` | `#E3F4FC` 浅瀬ソフト | `#0D2B3C` | 面(カード・コーチバブル) |
| `sand` / `sandText` | `#F6EFE3` / `#6B5636` 砂浜サンド | `#2A241B` / `#D8C29A` | 動機カードなど温かみを出す面 |
| `onTint` | `#FFFFFF` | `#04202E` | tint 上のテキスト |

SVGパスデータ・カラー値の原本はデザインプロトタイプ(`hotori-brand-redesign.html`)。

## キャラクター設定 — 威厳のあるカワウソコーチ

ホトリは、ユーザーの目標の道を**先に歩いた経験者**のカワウソコーチ。

### コーチ姿v2(2026-07-31、PR #35で実装)

- **深瀬ブルーのフード付きパーカー**(フードは背中に下ろして肩に畳んだ形)+ 胸に **COACH** の文字
- **細ワイヤーの丸メガネ** — 観察者・経験者の知性
- **水辺ブルーのランヤード+金属質ホイッスル** — コーチの証(v1のスカーフはこの紐色に継承して卒業)
- 明色のヒゲ、多層グラデーションの毛並み、水辺の照り返しリムライト
- やさしい垂れ眉と大きな瞳 — 威厳の中に「寄り添う優しさ」を残す

変わらない人格:

- 口調は断定調の敬語。自分の経験を根拠に語る(「私もその道を通りました」)
- 祝うときだけ、少しだけ相好を崩す
- 説教しない。できなかった日は「再開のしやすさ」を最優先する

言葉の運用ルール(使う語彙・禁止語・場面別の型)は **[tone-of-voice.md](tone-of-voice.md)** を参照。

実装は `src/components/hotori.tsx`。目・眉・口・腕をパーツ分けしたSVGコンポーネントで、ポーズはパーツの組み合わせ定義。`<Hotori pose="celebrate" size={96} />` のように使う。reduce motion 設定時はアニメーションを止めて静止ポーズを表示する。

### ポーズ8種と使用場面

| pose | 名前 | 使用場面 |
| --- | --- | --- |
| `normal` | 通常 | チャットのアバター、ヘッダー |
| `guide` | 案内 | オンボーディング、機能の初回説明 |
| `thinking` | 考え中 | AI応答・計画の生成中 |
| `celebrate` | 喜び | 「できた!」直後、週の達成 |
| `encourage` | 励まし | 未達成の日の夜、背中を押すとき |
| `applaud` | 拍手 | 目標達成、ストリーク節目 |
| `concern` | 心配 | ストリーク救済、おかえりデー |
| `sleep` | おやすみ | 夜の振り返り後、1日の終わり |
| `hero` | ヒーロー(ウィンク+指差し+観察ボード) | ペイウォール(PR #37で追加) |

### アニメーション3種(`animate` prop)

| animate | 内容 | 使いどころ |
| --- | --- | --- |
| `idle` | 瞬き+上下3pxの呼吸 | 画面に「生きている」感を出す基本ループ |
| `celebrate` | 跳ね+着水の波紋 | チェック完了・週達成の瞬間 |
| `thinking` | 腕組み+浮かぶ泡 | AI応答・計画生成の待ち時間 |

`variant="bust"` はチャットアバター用(頭部+パーカー肩、円形・水辺グラデ背景)。

## トーンオブボイス

「その道を先に歩いた経験者」。断定調の敬語で、自分の経験を根拠に語る。

3文ルール(プロキシ `proxy/src/prompts.ts` で制御): **①今日の事実をみとめる → ②自分の経験・専門知識でつなげる → ③明日の一歩を1つ提案**。

例:

- 初回のあいさつ: 「はじめまして、コーチのホトリです。この道は、私が先に歩いてきました。まずは今日の一歩から始めましょう。」
- くじけた日: 「疲れている日ほど、量より継続が効きます。私の経験では、5分だけ動いた日が後の転機になりました。今日は靴を履いて外に出る、それだけで十分です。」
- 週の達成: 「第2週、完了です。ここまで続いた人は、もう偶然では止まりません。来週は少しだけ歩幅を広げます。」

危機ワード検知と相談窓口案内(`proxy/src/prompts.ts` の `CRISIS_KEYWORDS` / `CRISIS_RESPONSE`)はキャラクター演出より常に優先。削除・迂回しない。

## アプリアイコン(v2: 2026-07-31、PR #37で差し替え)

水辺ブルーのグラデーション(`#7CC5E8` → `#2E9FD6` → `#17638F`)の正方形に、コーチ姿v2のバスト(頭部+パーカー+フードロール+COACH)。アイコンでは下端の視認性のためランヤードとホイッスルは外している。

- 原本SVG: `assets/brand/hotori-icon.svg`(背景込み)/ `assets/brand/hotori-icon-layer.svg`(背景なし透過。Icon Composer レイヤー用)
- 書き出し済みPNG(1024×1024): `assets/brand/hotori-icon.png`(`assets/images/icon.png` と同一)
- iOS 26 リキッドグラス用: `assets/expo.icon`(fill=水辺ブルーの automatic-gradient+`Assets/hotori.png` レイヤー)
- スプラッシュ: `assets/images/splash-icon.png`(円形バスト透過PNG。背景色 `#2E9FD6` は app.json 側)

### 手動エクスポート手順

PNGの再生成は Chrome headless を使う(**qlmanage は透過を白背景に潰すため使わない**):

```sh
# 背景込みアイコン(→ assets/images/icon.png にもコピー)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --screenshot=assets/brand/hotori-icon.png --window-size=1024,1024 \
  --default-background-color=FFFFFFFF "file://$PWD/assets/brand/hotori-icon.svg"

# 透過レイヤー(→ assets/expo.icon/Assets/hotori.png にコピー)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --screenshot=/tmp/hotori-layer.png --window-size=1024,1024 \
  --default-background-color=00000000 "file://$PWD/assets/brand/hotori-icon-layer.svg"
```

`assets/expo.icon/icon.json` はテキスト編集で更新できる(fill と layers を保持したまま画像だけ差し替えるなら Assets/hotori.png の上書きのみでよい)。反映は次回の `npx eas build --platform ios` から。`app.json` のアイコン設定は変更不要。

## キャラクターSVGアセット(デザインツール用)

`assets/brand/poses/` に、外部デザインツール(Claude Design / Figma 等)にそのまま読み込める自己完結SVG(コーチ姿v2原本)を格納:

- `hotori-pose-{normal|guide|thinking|celebrate|encourage|sleep|concern|applaud}.svg` — 全身ポーズ8種(480×480、viewBox "-17 -6 160 160"。水辺の背景・波紋・光の粒などの舞台要素コメント付き。**舞台要素はアプリ実装対象外**)
- `hotori-pose-hero.svg` — ヒーローポーズ(ウィンク+指差し+観察ボード)
- `hotori-bust.svg` — バストアップ(チャットアバター用、viewBox 0 0 120 120、円形水辺グラデ背景込み)

アプリ内での描画原本は `src/components/hotori.tsx`(react-native-svg)。キャラクターの形状を変更する場合は hotori.tsx とこれらのSVGの両方を更新すること。実使用では**全身=透明背景、バスト=円形グラデ背景常付き**、波紋は celebrate の着水演出のみ。

## ブランドコンセプト

誰にも見せない目標を、AIとふたりだけで一歩ずつ進める **「シークレット・ジャーニー」**。

目標・行動記録・対話履歴はすべて端末内に保存され、端末の外に保存されないというプロダクトの訴求点を、ブランドの中心に据える。

## タグライン(正式確定: 2026-07-18)

> **あなたの目標は、この端末から出ない。**

アプリ内・App Storeストア文言に一貫して展開する正式タグライン。
フルバージョン「あなたの目標は、この端末から出ない。ホトリはただ、そばにいる。」は、余韻を持たせたい場面(説明文の結びなど)でのみ使う。

## ポジショニング

ソーシャル型(みんなで報告し合う)・トラッカー型(記録して可視化する)・汎用AIチャットのどれでもない、**「シークレット・コーチング」**。

比較文脈で使うコピー:

- 「みんなで頑張るのがしんどい人へ」
- 「宣言しなくていい。続けるだけでいい」

## 技術上の注意(変更禁止)

`app.json` の以下は **旧名のまま変更しない**。

- `"slug": "mobileapp"` — EASプロジェクトと紐付いており、変更するとビルド・更新配信が壊れる
- `"bundleIdentifier": "dev.shinji.aicoach"` — App Storeの審査レコード・アプリIDと紐付いており、変更すると別アプリ扱いになる

リネームで変更するのは表示名 `"name"`(ホーム画面に出る名前)と、UI・ドキュメント・プロンプト上の呼称のみ。
