import type { SFSymbol } from 'expo-symbols';

/**
 * 目標カテゴリの定義。
 * id はDB・分析イベント(PostHog)にそのまま送る値なので変更しない(送信は定義済みenum値のみ)。
 */

export type GoalCategory = 'health' | 'training' | 'career' | 'learning' | 'money' | 'other';

export type CategoryDef = {
  id: GoalCategory;
  /** カード・バッジに表示する名前 */
  label: string;
  /** カードの補足(例の列挙) */
  description: string;
  /** SF Symbols のアイコン名(絵文字は使わない) */
  symbol: SFSymbol;
  /** 目標入力欄のプレースホルダ */
  placeholder: string;
  /** 「AIのおすすめ」候補チップの静的プール(5〜8個) */
  suggestions: string[];
};

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'health',
    label: '健康・生活習慣',
    description: '運動、睡眠、食生活',
    symbol: 'figure.walk',
    placeholder: '例: 毎日7時間睡眠を確保する',
    suggestions: [
      '毎日7時間睡眠を確保する',
      '週3回30分ウォーキングする',
      '毎朝コップ1杯の水を飲む',
      '夜23時までにスマホを手放す',
      '週5日自炊する',
      '毎日野菜を2品食べる',
    ],
  },
  {
    id: 'training',
    label: 'トレーニング',
    description: '筋トレ、減量、体力向上',
    symbol: 'dumbbell',
    placeholder: '例: 週3回ジムで筋トレする',
    suggestions: [
      '週3回ジムで筋トレする',
      '3ヶ月で体重を3kg減らす',
      '毎日スクワットを30回する',
      '月に合計50km走る',
      '腕立て伏せを連続30回できるようになる',
      '週2回30分ランニングする',
    ],
  },
  {
    id: 'career',
    label: 'ビジネス・キャリア',
    description: '昇進、転職、スキルアップ',
    symbol: 'briefcase',
    placeholder: '例: 職務経歴書を完成させて転職活動を始める',
    suggestions: [
      '職務経歴書を完成させて転職活動を始める',
      '毎日30分業界の情報をインプットする',
      '社内プレゼンで新しい企画を通す',
      '月1回社外の勉強会に参加する',
      '半年で昇進につながる実績を1つ作る',
      '毎週1人、新しい人と仕事の話をする',
    ],
  },
  {
    id: 'learning',
    label: '学習・資格',
    description: '語学、資格試験、勉強習慣',
    symbol: 'book',
    placeholder: '例: TOEICで800点を取る',
    suggestions: [
      'TOEICで800点を取る',
      '毎日30分英語を勉強する',
      '簿記3級に合格する',
      '基本情報技術者試験に合格する',
      '毎日英単語を20個覚える',
      '週5日、朝1時間勉強する',
    ],
  },
  {
    id: 'money',
    label: 'お金・貯蓄',
    description: '貯金、副業、家計管理',
    symbol: 'yensign.circle',
    placeholder: '例: 毎月3万円貯金する',
    suggestions: [
      '毎月3万円貯金する',
      '半年で貯金30万円を達成する',
      '家計簿を毎日つける',
      '副業で月1万円稼ぐ',
      '固定費を月5,000円削減する',
      '先取り貯金の仕組みを作る',
    ],
  },
  {
    id: 'other',
    label: 'その他',
    description: '自由に入力する',
    symbol: 'pencil',
    placeholder: '例: 毎日日記を書く',
    suggestions: [
      '毎日日記を書く',
      '月2冊本を読む',
      '週1回部屋を片付ける',
      '毎朝5分瞑想する',
      '毎日家族と15分話す時間を作る',
    ],
  },
];

export function getCategory(id: GoalCategory): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
