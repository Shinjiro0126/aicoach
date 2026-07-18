import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Hotori } from '@/components/hotori';
import { OnboardingNav } from '@/components/onboarding-steps';
import { PrivacyBadge } from '@/components/privacy-badge';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { getHearingQuestions } from '@/constants/hearing';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useOnboardingStore } from '@/stores/onboarding';

/** チャットのアバター(ホトリbust)の表示サイズ。チップのインデントにも使う */
const AVATAR_SIZE = 30;

/** ホトリの吹き出し1つ(アバターつき) */
function CoachBubble({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.coachRow}>
      <Hotori variant="bust" size={AVATAR_SIZE} />
      <View style={[styles.bubble, styles.coachBubble, { backgroundColor: theme.tintSoft }]}>
        <ThemedText type="small" style={styles.bubbleText}>
          {text}
        </ThemedText>
      </View>
    </View>
  );
}

/** ユーザーの回答の吹き出し(右寄せ) */
function MeBubble({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.meRow}>
      <View style={[styles.bubble, styles.meBubble, { backgroundColor: theme.tint }]}>
        <ThemedText type="small" style={[styles.bubbleText, { color: theme.onTint }]}>
          {text}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * 現在地ヒアリング: ホトリがチャット形式で2〜3問聞く。
 * 回答はチップをタップするだけ。すべて任意で、右上からスキップできる。
 * 回答は計画生成(期間おすすめ・週次ペース配分)にのみ使う。
 */
export default function HearingScreen() {
  const theme = useTheme();
  const { category, hearingAnswers, setHearingAnswer } = useOnboardingStore();

  const questions = getHearingQuestions(category);
  // 先頭から連続して答え終わった数 = いま表示する質問のindex(ストア由来なので戻っても消えない)
  let answeredCount = 0;
  while (answeredCount < questions.length && hearingAnswers[questions[answeredCount].id]) {
    answeredCount++;
  }
  const done = answeredCount >= questions.length;
  const remaining = questions.length - answeredCount;

  const next = () => router.push('/onboarding/duration');

  return (
    <Screen scroll>
      <OnboardingNav current={2} onSkip={next} />

      <View style={styles.headerRow}>
        <ThemedText type="subtitle">いまの現在地を{'\n'}教えてください</ThemedText>
        {!done && (
          <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
            あと{remaining}問
          </ThemedText>
        )}
      </View>

      <View style={styles.chat}>
        {questions.slice(0, Math.min(answeredCount + 1, questions.length)).map((q) => {
          const answer = hearingAnswers[q.id];
          return (
            <View key={q.id} style={styles.chat}>
              <CoachBubble text={q.text} />
              {answer ? (
                <MeBubble text={answer} />
              ) : (
                <View style={styles.chips}>
                  {q.options.map((option) => (
                    <Chip key={option} label={option} onPress={() => setHearingAnswer(q.id, option)} />
                  ))}
                </View>
              )}
            </View>
          );
        })}
        {done && <CoachBubble text="ありがとうございます。この現在地に合わせて、計画を仕立てます。" />}
      </View>

      <View style={styles.bottomArea}>
        <PrivacyBadge text="回答は計画づくりに使うだけ。端末の外に保存されません" />
        <Button title="次へ" disabled={!done} onPress={next} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  chat: { gap: Spacing.two + Spacing.one },
  coachRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  meRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  coachBubble: { borderBottomLeftRadius: 5 },
  meBubble: { borderBottomRightRadius: 5 },
  bubbleText: { lineHeight: 20 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingLeft: AVATAR_SIZE + Spacing.two,
  },
  bottomArea: { gap: Spacing.two + Spacing.one, marginTop: Spacing.two },
});
