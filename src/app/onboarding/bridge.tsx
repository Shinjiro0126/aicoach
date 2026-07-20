import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { Hotori } from '@/components/hotori';
import { OnboardingNav } from '@/components/onboarding-steps';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useSuggestPrefetch } from '@/hooks/use-suggest-prefetch';
import { useTheme } from '@/hooks/use-theme';
import { useOnboardingStore } from '@/stores/onboarding';

/** ホトリの表示幅(泡の静止表示の座標計算にも使う) */
const HOTORI_SIZE = 128;
/** viewBox(120)1単位あたりの実px */
const PX = HOTORI_SIZE / 120;
/** 考え中の泡の色(hotori.tsx の BUBBLE と同じ値) */
const BUBBLE_COLOR = '#9DC3D9';

/**
 * 泡の静止表示(reduce motion時用)。
 * Hotori の thinking アニメーションが止まると泡ごと消えるため、
 * 同じ座標(cx, cy, r は viewBox 基準)に静的な泡を重ねる。
 */
function StaticBubble({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const d = 2 * r * PX;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (cx - r) * PX,
        top: (cy - r) * PX,
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: BUBBLE_COLOR,
      }}
    />
  );
}

/**
 * 褒め+橋渡しページ(ヒアリング完了 → 期間選択の間)。
 * 目標を言葉にしたことを認め、次の一歩(期間)へつなぐ。
 * この画面のマウントと同時に期間おすすめの見立てを先読みし、
 * ユーザーが読んでいる数秒で応答を届けておくのが役割。
 */
export default function BridgeScreen() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const title = useOnboardingStore((s) => s.title);

  // 表示した瞬間に見立てAPIを裏で先読み(結果はオンボーディングストアで共有)
  useSuggestPrefetch();

  return (
    <Screen>
      {/* 橋渡しはヒアリングと同じ現在位置扱い(ステップ数は増やさない) */}
      <OnboardingNav current={2} />

      <View style={styles.center}>
        <View style={styles.hotoriWrap}>
          <Hotori pose="guide" size={HOTORI_SIZE} animate="thinking" />
          {reduceMotion && (
            <>
              <StaticBubble cx={97} cy={45} r={3} />
              <StaticBubble cx={105} cy={36} r={4.6} />
            </>
          )}
        </View>

        <ThemedText type="subtitle" style={styles.centerText}>
          いい目標です。
        </ThemedText>
        <ThemedText style={styles.centerText}>
          「{title}」——言葉にした時点で、最初の一歩は済んでいます。
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          次は、どのくらいの期間で目指すかを決めましょう。
        </ThemedText>

        <View style={[styles.chip, { backgroundColor: theme.tintSoft }]}>
          <SymbolView name="bubbles.and.sparkles" size={16} tintColor={theme.tint} />
          <ThemedText type="smallBold" style={{ color: theme.tintDeep, fontSize: 12, lineHeight: 16 }}>
            あなたと一緒に、ホトリも考えはじめています
          </ThemedText>
        </View>
      </View>

      <Button title="期間を決める" onPress={() => router.push('/onboarding/duration')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  hotoriWrap: {
    width: HOTORI_SIZE,
    height: (HOTORI_SIZE * 150) / 120,
    marginBottom: Spacing.two,
  },
  centerText: { textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    marginTop: Spacing.one,
  },
});
