import type { GoalCategory } from '@/constants/categories';

/**
 * 現在地ヒアリングの質問テンプレート(カテゴリ別に2〜3問)。
 * ホトリがチャット形式で聞き、ユーザーはチップをタップして答える。
 * 回答は計画生成(期間おすすめ・週次ペース配分)にだけ使い、端末の外には保存しない。
 * id はDB(goals.hearing_answers のJSON)にそのまま入るため変更しない。
 */

export type HearingQuestion = {
  /** 質問の一意なid(例: health_frequency)。変更しない */
  id: string;
  /** ホトリの吹き出しに表示する質問文 */
  text: string;
  /** チップの選択肢 */
  options: string[];
};

export const HEARING_QUESTIONS: Record<GoalCategory, HearingQuestion[]> = {
  health: [
    {
      id: 'health_current',
      text: '計画を仕立てる前に、少しだけ聞かせてください。いまは運動をどのくらいしていますか?',
      options: ['ほとんどしていない', '週1回くらい', '週2〜3回', 'ほぼ毎日'],
    },
    {
      id: 'health_time',
      text: 'ありがとうございます。1日に使えそうな時間はどのくらいですか?',
      options: ['5〜10分', '15〜30分', '30分以上', '日による'],
    },
    {
      id: 'health_history',
      text: '最後にひとつ。同じような目標に挑戦したことはありますか?',
      options: ['今回が初めて', '挑戦したが続かなかった', '続いた経験がある'],
    },
  ],
  training: [
    {
      id: 'training_current',
      text: '計画を仕立てる前に、少しだけ聞かせてください。いまのトレーニング頻度はどのくらいですか?',
      options: ['まったくしていない', '週1回くらい', '週2〜3回', 'ほぼ毎日'],
    },
    {
      id: 'training_time',
      text: 'ありがとうございます。1回に使えそうな時間はどのくらいですか?',
      options: ['10分以内', '20〜30分', '1時間くらい', '日による'],
    },
    {
      id: 'training_history',
      text: '最後にひとつ。本格的に体を鍛えた経験はありますか?',
      options: ['今回が初めて', '昔やっていた', '今も少し続けている'],
    },
  ],
  career: [
    {
      id: 'career_current',
      text: '計画を仕立てる前に、少しだけ聞かせてください。この目標に向けて、いまはどの段階ですか?',
      options: ['これから情報収集', '少し動き始めている', '具体的に進んでいる'],
    },
    {
      id: 'career_time',
      text: 'ありがとうございます。平日に使えそうな時間はどのくらいですか?',
      options: ['15分以内', '30分くらい', '1時間以上', '日による'],
    },
    {
      id: 'career_history',
      text: '最後にひとつ。同じような挑戦をした経験はありますか?',
      options: ['今回が初めて', '途中でやめたことがある', 'やり切った経験がある'],
    },
  ],
  learning: [
    {
      id: 'learning_current',
      text: '計画を仕立てる前に、少しだけ聞かせてください。いまの勉強の習慣はどのくらいですか?',
      options: ['ほとんどしていない', '気が向いたときだけ', '週に数回', 'ほぼ毎日'],
    },
    {
      id: 'learning_time',
      text: 'ありがとうございます。1日に使えそうな時間はどのくらいですか?',
      options: ['15分以内', '30分くらい', '1時間以上', '日による'],
    },
    {
      id: 'learning_history',
      text: '最後にひとつ。この分野を学んだ経験はありますか?',
      options: ['まったくの初学者', '基礎はやったことがある', 'ブランクがあるが経験あり'],
    },
  ],
  money: [
    {
      id: 'money_current',
      text: '計画を仕立てる前に、少しだけ聞かせてください。いまの家計の把握度はどのくらいですか?',
      options: ['ほとんど把握していない', 'ざっくりなら分かる', '毎月記録している'],
    },
    {
      id: 'money_history',
      text: 'ありがとうございます。貯蓄や節約に取り組んだ経験はありますか?',
      options: ['今回が初めて', '続かなかったことがある', '続いた経験がある'],
    },
  ],
  other: [
    {
      id: 'other_current',
      text: '計画を仕立てる前に、少しだけ聞かせてください。この目標には、いまどのくらい取り組めていますか?',
      options: ['まだ何もしていない', 'ときどきやっている', 'ほぼ習慣になっている'],
    },
    {
      id: 'other_time',
      text: 'ありがとうございます。1日に使えそうな時間はどのくらいですか?',
      options: ['5〜10分', '15〜30分', '30分以上', '日による'],
    },
  ],
};

/** カテゴリに対応する質問リストを返す(未知のカテゴリは other 扱い) */
export function getHearingQuestions(category: GoalCategory | null): HearingQuestion[] {
  return HEARING_QUESTIONS[category ?? 'other'] ?? HEARING_QUESTIONS.other;
}

/**
 * ストアの回答(質問id → 回答)を、AIへ渡す「質問文+回答」のペア配列に変換する。
 * 回答済みの質問だけを質問順で並べる。
 */
export function toHearingPairs(
  category: GoalCategory | null,
  answers: Record<string, string>,
): { question: string; answer: string }[] {
  return getHearingQuestions(category)
    .filter((q) => answers[q.id])
    .map((q) => ({ question: q.text, answer: answers[q.id] }));
}
