import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Hotori } from '@/components/hotori';
import { OnboardingNav } from '@/components/onboarding-steps';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useSuggestPrefetch } from '@/hooks/use-suggest-prefetch';
import { useTheme } from '@/hooks/use-theme';
import { clampWeeks, MAX_DURATION_WEEKS, MIN_DURATION_WEEKS, monthsToWeeks, weeksLabel } from '@/lib/roadmap';
import { useOnboardingStore } from '@/stores/onboarding';

/** プリセット4種(月数)。選択状態は週数に換算して一元管理する */
const PRESETS: { months: number; big: string; unit: string }[] = [
  { months: 1, big: '1', unit: 'ヶ月' },
  { months: 3, big: '3', unit: 'ヶ月' },
  { months: 6, big: '6', unit: 'ヶ月' },
  { months: 12, big: '1', unit: '年' },
];

/** 考え中カードの最低表示時間(一度見せたらこの時間は保つ。チラつき防止) */
const MIN_THINKING_MS = 600;
/** 考え中→結果のクロスフェード時間 */
const FADE_MS = 450;
/** おすすめバッジのpop(弾み)。プロトタイプの cubic-bezier(0.2, 1.5, 0.4, 1) 相当 */
const POP_EASING = Easing.bezier(0.2, 1.5, 0.4, 1);

/** ステッパーの丸ボタン(44ptタップ領域) */
function StepperButton({
  symbol,
  label,
  disabled,
  onPress,
}: {
  symbol: 'minus' | 'plus';
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepperButton,
        { backgroundColor: theme.background, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}>
      <SymbolView name={symbol} size={16} tintColor={theme.tintDeep} weight="semibold" />
    </Pressable>
  );
}

/** 考え中のドット1粒(1.4秒周期の明滅。位相をずらして3粒並べる) */
function ThinkingDot({ delay, color, reduceMotion }: { delay: number; color: string; reduceMotion: boolean }) {
  const opacity = useSharedValue(0.25);
  useEffect(() => {
    if (reduceMotion) {
      // reduce motion時は明滅させず静止表示
      opacity.value = 0.6;
      return;
    }
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 420 }),
          withTiming(0.25, { duration: 420 }),
          withTiming(0.25, { duration: 560 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [delay, reduceMotion, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.thinkDot, { backgroundColor: color }, style]} />;
}

/** 考えの広がりを表す波紋1輪(2.6秒周期で広がって消える) */
/** 折りたたみ表示する行数(カードの高さを3状態で共通に保つための初期値) */
const REASON_COLLAPSED_LINES = 3;

/**
 * ホトリの理由文。通常は3行で表示し、収まらない場合だけ「すべて読む」で全文に展開できる。
 * 展開はユーザーのタップ起点なので、カードが伸びてもレイアウトジャンプにはならない。
 * reason が変わったら親側で key を変えて状態をリセットする。
 */
function ExpandableReason({ reason }: { reason: string }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  // 全文の実際の行数。不可視の計測用コピーで一度だけ数える(表示側は clamp されるため測れない)
  const [fullLines, setFullLines] = useState<number | null>(null);
  const truncatable = (fullLines ?? 0) > REASON_COLLAPSED_LINES;

  return (
    <View>
      {/* 展開時以外は常にclamp(計測完了前に全文がレイアウトされてカードが一瞬跳ねるのを防ぐ。3行以下の文には影響なし) */}
      <ThemedText
        type="small"
        style={styles.recoReason}
        numberOfLines={expanded ? undefined : REASON_COLLAPSED_LINES}>
        {reason}
      </ThemedText>
      {fullLines === null && (
        <ThemedText
          type="small"
          style={[styles.recoReason, styles.reasonMeasure]}
          onTextLayout={(e) => setFullLines(e.nativeEvent.lines.length)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {reason}
        </ThemedText>
      )}
      {truncatable && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? '理由文を閉じる' : '理由文をすべて読む'}
          hitSlop={8}
          onPress={() => setExpanded((v) => !v)}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'flex-start' })}>
          <ThemedText type="smallBold" style={{ color: theme.tint, fontSize: 12, lineHeight: 18 }}>
            {expanded ? '閉じる' : 'すべて読む'}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function RippleRing({ delay, color }: { delay: number; color: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1),
    );
    return () => cancelAnimation(progress);
  }, [delay, progress]);
  const style = useAnimatedStyle(() => {
    const p = Math.min(progress.value / 0.8, 1);
    const scale = 0.35 + 0.65 * p;
    return { opacity: 0.5 * (1 - p), transform: [{ scaleX: scale }, { scaleY: scale }] };
  });
  return <Animated.View style={[styles.rippleRing, { borderColor: color }, style]} />;
}

export default function DurationScreen() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const { title, durationWeeks, setDurationWeeks } = useOnboardingStore();

  // 見立て(橋渡しページで先読み済みならここで即座に得られる)。
  // フォールバック保証つきなので、時間はかかっても必ず結果が届く
  const { suggestion } = useSuggestPrefetch();

  // マウント時点で先読みが解決済みなら、考え中を経由せず最初から結果を表示する。
  // 未解決なら考え中カードを出し、一度見せたら最低 MIN_THINKING_MS は保つ(チラつき防止)
  const [minWaitDone, setMinWaitDone] = useState(() => suggestion != null);
  useEffect(() => {
    if (minWaitDone) return;
    const timer = setTimeout(() => setMinWaitDone(true), MIN_THINKING_MS);
    return () => clearTimeout(timer);
  }, [minWaitDone]);

  const showResult = suggestion != null && minWaitDone;

  // クロスフェード完了後は考え中をアンマウントする(泡・波紋のループを止める)
  const [thinkingGone, setThinkingGone] = useState(() => suggestion != null);
  useEffect(() => {
    if (!showResult || thinkingGone) return;
    const timer = setTimeout(() => setThinkingGone(true), reduceMotion ? 0 : FADE_MS);
    return () => clearTimeout(timer);
  }, [showResult, thinkingGone, reduceMotion]);

  // 考え中(1 - fade)→ 結果(fade)のクロスフェード。reduce motion時は即時切り替え
  const fade = useSharedValue(showResult ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      fade.value = showResult ? 1 : 0;
      return;
    }
    fade.value = withTiming(showResult ? 1 : 0, { duration: FADE_MS, easing: Easing.inOut(Easing.quad) });
    return () => cancelAnimation(fade);
  }, [showResult, reduceMotion, fade]);

  // おすすめバッジのpop(カード内バッジ→少し遅れてグリッドのミニバッジ)
  const pop = useSharedValue(0);
  const miniPop = useSharedValue(0);
  useEffect(() => {
    if (!showResult) {
      pop.value = 0;
      miniPop.value = 0;
      return;
    }
    if (reduceMotion) {
      pop.value = 1;
      miniPop.value = 1;
      return;
    }
    pop.value = withTiming(1, { duration: 500, easing: POP_EASING });
    miniPop.value = withDelay(250, withTiming(1, { duration: 500, easing: POP_EASING }));
    return () => {
      cancelAnimation(pop);
      cancelAnimation(miniPop);
    };
  }, [showResult, reduceMotion, pop, miniPop]);

  const thinkingStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));
  const resultStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value),
    transform: [{ scale: 0.6 + 0.4 * pop.value }],
  }));
  const miniBadgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, miniPop.value),
    transform: [{ scale: 0.6 + 0.4 * miniPop.value }],
  }));

  // ユーザー未選択の間は、AIおすすめ(なければ3ヶ月相当)を初期選択として表示する。
  // おすすめの反映は showResult(クロスフェードの瞬間)でゲートし、考え中の最低表示中に
  // 解決しても選択枠・ステッパーだけが先に切り替わらないようにする(カード・ミニバッジと同期)
  const selectedWeeks = durationWeeks ?? (showResult ? suggestion?.weeks : undefined) ?? monthsToWeeks(3);

  const next = () => {
    // 初期選択のまま進んだ場合もストアに確定させる(戻ったときに選択が保持される)
    setDurationWeeks(selectedWeeks);
    router.push('/onboarding/why');
  };

  return (
    <Screen scroll>
      <OnboardingNav current={3} />

      <ThemedText type="subtitle">どのくらいの期間で{'\n'}目指しますか?</ThemedText>

      <View style={[styles.goalChip, { backgroundColor: theme.backgroundElement }]}>
        <SymbolView name="target" size={13} tintColor={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
        </ThemedText>
      </View>

      {/* おすすめカード: 考え中/結果で高さ共通(minHeight)のままクロスフェードする */}
      <View style={[styles.recoCard, { backgroundColor: theme.tintSoft }]}>
        {suggestion && (
          <Animated.View
            style={[styles.recoContent, resultStyle]}
            // 考え中の間は不可視(opacity 0)のままマウントされるため、スクリーンリーダーからも隠す
            accessibilityElementsHidden={!showResult}
            importantForAccessibility={showResult ? 'auto' : 'no-hide-descendants'}>
            <Hotori variant="bust" size={40} />
            <View style={styles.recoBody}>
              <Animated.View style={[styles.recoBadge, { backgroundColor: theme.tint }, badgeStyle]}>
                <SymbolView name="sparkles" size={11} tintColor={theme.onTint} />
                <ThemedText type="small" style={{ color: theme.onTint, fontWeight: '700', fontSize: 11, lineHeight: 14 }}>
                  ホトリのおすすめ: {weeksLabel(suggestion.weeks)}
                </ThemedText>
              </Animated.View>
              {/* 理由文: 通常3行、収まらない時だけ「すべて読む」で全文展開(keyで文言変更時に状態リセット) */}
              <ExpandableReason key={suggestion.reason} reason={suggestion.reason} />
            </View>
          </Animated.View>
        )}
        {!thinkingGone && (
          <Animated.View
            style={[styles.thinkingOverlay, thinkingStyle]}
            pointerEvents="none"
            // クロスフェード開始後(フェードアウト中)はスクリーンリーダーからも隠す
            accessibilityElementsHidden={showResult}
            importantForAccessibility={showResult ? 'no-hide-descendants' : 'auto'}>
            <Hotori pose="thinking" size={56} animate="thinking" />
            <View style={styles.recoBody}>
              <View style={styles.thinkLineRow}>
                <ThemedText type="smallBold" style={{ color: theme.tintDeep, fontSize: 13, lineHeight: 18 }}>
                  ホトリが道のりを考えています
                </ThemedText>
                <View style={styles.thinkDots}>
                  <ThinkingDot delay={0} color={theme.tintDeep} reduceMotion={reduceMotion} />
                  <ThinkingDot delay={200} color={theme.tintDeep} reduceMotion={reduceMotion} />
                  <ThinkingDot delay={400} color={theme.tintDeep} reduceMotion={reduceMotion} />
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.thinkSub}>
                現在地の答えをもとに、ちょうどいい歩幅を見立てています
              </ThemedText>
            </View>
            {!reduceMotion && (
              <View style={styles.ripple} pointerEvents="none">
                <RippleRing delay={0} color={theme.tint} />
                <RippleRing delay={1300} color={theme.tint} />
              </View>
            )}
          </Animated.View>
        )}
      </View>

      <View style={styles.grid}>
        {PRESETS.map((p) => {
          const weeks = monthsToWeeks(p.months);
          const selected = selectedWeeks === weeks;
          const recommended = showResult && suggestion?.weeks === weeks;
          return (
            <Pressable
              key={p.months}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${p.big}${p.unit}`}
              onPress={() => setDurationWeeks(weeks)}
              style={({ pressed }) => [
                styles.cell,
                {
                  backgroundColor: selected ? theme.tintSoft : theme.backgroundElement,
                  borderColor: selected ? theme.tint : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              {recommended && (
                <Animated.View style={[styles.miniBadge, { backgroundColor: theme.tint }, miniBadgeStyle]}>
                  <ThemedText type="small" style={{ color: theme.onTint, fontSize: 9, lineHeight: 12, fontWeight: '700' }}>
                    おすすめ
                  </ThemedText>
                </Animated.View>
              )}
              <ThemedText type="smallBold" style={styles.cellBig}>
                {p.big}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.cellUnit}>
                {p.unit}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.customBox, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">自分で決める</ThemedText>
        <View style={styles.stepper}>
          <StepperButton
            symbol="minus"
            label="1週間減らす"
            disabled={selectedWeeks <= MIN_DURATION_WEEKS}
            onPress={() => setDurationWeeks(clampWeeks(selectedWeeks - 1))}
          />
          <View style={styles.stepperValue}>
            <ThemedText style={styles.stepperNumber}>{selectedWeeks}</ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary">
              週間
            </ThemedText>
          </View>
          <StepperButton
            symbol="plus"
            label="1週間増やす"
            disabled={selectedWeeks >= MAX_DURATION_WEEKS}
            onPress={() => setDurationWeeks(clampWeeks(selectedWeeks + 1))}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerNote}>
          2週間〜2年の間で、1週間きざみで設定できます
        </ThemedText>
      </View>

      <View style={styles.bottomArea}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerNote}>
          期間は目安です。あとから目標を作り直すこともできます
        </ThemedText>
        <Button title="次へ" onPress={next} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one + 2,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  recoCard: {
    borderRadius: 16,
    minHeight: 120,
    padding: Spacing.three - 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  recoContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three - 4,
  },
  thinkingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.three - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  thinkLineRow: { flexDirection: 'row', alignItems: 'center' },
  thinkDots: { flexDirection: 'row', gap: 3, marginLeft: 3 },
  thinkDot: { width: 4, height: 4, borderRadius: 2 },
  thinkSub: { fontSize: 11.5, lineHeight: 17 },
  ripple: { position: 'absolute', left: 22, bottom: 8, width: 44, height: 8 },
  rippleRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  recoBody: { flex: 1, gap: Spacing.one + 2 },
  recoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  recoReason: { lineHeight: 21 },
  /** 全文の行数を数えるための不可視コピー。視覚・読み上げの両方から隠す */
  reasonMeasure: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
  grid: { flexDirection: 'row', gap: Spacing.two },
  cell: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.one,
    alignItems: 'center',
  },
  miniBadge: {
    position: 'absolute',
    top: -9,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  cellBig: { fontSize: 16, lineHeight: 20 },
  cellUnit: { fontSize: 11, lineHeight: 14 },
  customBox: {
    borderRadius: 16,
    padding: Spacing.three - 2,
    gap: Spacing.two + 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three + 2,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  stepperValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Spacing.one,
    minWidth: 96,
  },
  stepperNumber: { fontSize: 22, lineHeight: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  centerNote: { textAlign: 'center' },
  bottomArea: { gap: Spacing.two, marginTop: Spacing.two },
});
