import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';

import { PopIn, Sparkle } from '@/components/celebration';
import { Hotori } from '@/components/hotori';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import type { NextWeekPace } from '@/lib/pace';

/**
 * 旗の日(週の7日目)の提出時に、通常の Celebration の代わりに表示する週の締めセレモニー。
 * 構成: 旗が立つ演出 + applaudホトリ → 見出し → 週まとめ1行(端末内集計) →
 * ひとこと観察(buildTeaser・無料) → 次週プレビュー → 歩幅宣言(3択)への導線。
 * 文言・集計は呼び出し側(ホーム)が純関数で組み立てて渡す。
 */

type FlagCelebrationProps = {
  weekNo: number;
  /** 週のまとめ1行(lib/flag-day.ts の buildFlagWeekSummary) */
  summaryText: string;
  /** ひとこと観察(lib/insight-stats.ts の buildTeaser) */
  teaserText: string;
  /** 次週プレビュー(lib/flag-day.ts の buildNextWeekPreview) */
  previewText: string;
  /** プレミアムなら手帳への直行導線、無料ならペイウォールへの導線を出す(C-3) */
  premium: boolean;
  /** 歩幅を選んだとき(保存・計測・クローズは呼び出し側) */
  onSelectPace: (pace: NextWeekPace) => void;
  /** 観察手帳をひらく(プレミアムのみ。遷移・計測・クローズは呼び出し側) */
  onOpenNotebook: () => void;
  /** ホトリの見立てを読む(無料のみ。ペイウォールへの遷移・クローズは呼び出し側) */
  onOpenPaywall: () => void;
  onClose: () => void;
};

const PACE_OPTIONS: { pace: NextWeekPace; label: string }[] = [
  { pace: 'keep', label: 'この歩幅のまま' },
  { pace: 'lighter', label: '少し軽くする' },
  { pace: 'wider', label: '少し広げる' },
];

const SPARKLES = [
  { top: 10, left: 14, size: 16, delay: 0 },
  { top: 7, left: 78, size: 12, delay: 600 },
  { top: 24, left: 86, size: 14, delay: 1100 },
];

/** 旗が立つ演出(SVGフィルター不使用)。下から差し込まれて立ち、reduce motion 時は静止表示 */
function FlagRise() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      // reduce motion は非同期に検出されるため、途中値で固まらないよう最終値を明示する
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.6)) });
    return () => cancelAnimation(progress);
  }, [reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 2),
    transform: [{ translateY: (1 - progress.value) * 26 }],
  }));

  return (
    <Animated.View style={style}>
      <Svg width={84} height={120} viewBox="0 0 84 120">
        <Ellipse cx={41} cy={110} rx={24} ry={6} fill={theme.backgroundSelected} />
        <Rect x={39} y={12} width={4} height={98} rx={2} fill={theme.textSecondary} />
        <Path d="M43 14 L80 27 L43 40 Z" fill={theme.tintDeep} />
      </Svg>
    </Animated.View>
  );
}

export function FlagCelebration({
  weekNo,
  summaryText,
  teaserText,
  previewText,
  premium,
  onSelectPace,
  onOpenNotebook,
  onOpenPaywall,
  onClose,
}: FlagCelebrationProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [step, setStep] = useState<'ceremony' | 'pace'>('ceremony');

  // ---- 来週の歩幅宣言(3択)----
  if (step === 'pace') {
    return (
      <View style={styles.wrap}>
        <View style={styles.center}>
          <Hotori pose="guide" size={110} />
          <ThemedText style={styles.title}>
            来週の歩幅を決めましょう。{'\n'}最後に選ぶのは、あなたです。
          </ThemedText>
          <View style={styles.chips}>
            {PACE_OPTIONS.map((option) => (
              <Chip key={option.pace} label={option.label} onPress={() => onSelectPace(option.pace)} />
            ))}
          </View>
        </View>
        <View style={styles.bottom}>
          <Button title="今回は決めずに閉じる" variant="ghost" onPress={onClose} />
        </View>
      </View>
    );
  }

  // ---- 週の締めセレモニー ----
  return (
    <View style={styles.wrap}>
      {SPARKLES.map((s, i) => (
        <Sparkle key={i} {...s} />
      ))}

      <View style={styles.center}>
        <View style={styles.heroRow}>
          <FlagRise />
          <Hotori pose="applaud" size={104} animate={reduceMotion ? undefined : 'idle'} />
        </View>
        <PopIn delay={300}>
          <ThemedText style={styles.title}>第{weekNo}週の旗に、{'\n'}たどり着きました。</ThemedText>
        </PopIn>
        <PopIn delay={600}>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" style={styles.cardText}>
              {summaryText}
            </ThemedText>
          </View>
        </PopIn>
        <PopIn delay={900}>
          <View style={[styles.card, { backgroundColor: theme.tintSoft }]}>
            <View style={styles.teaserHead}>
              <SymbolView name="eye" size={13} tintColor={theme.tintDeep} />
              <ThemedText type="small" style={[styles.teaserLabel, { color: theme.tintDeep }]}>
                ホトリのひとこと観察
              </ThemedText>
            </View>
            <ThemedText type="small" style={styles.cardText}>
              {teaserText}
            </ThemedText>
            {/* 手帳への入口(C-3)。プレミアム=手帳へ直行 / 無料=ペイウォールへ */}
            <Pressable
              accessibilityRole="button"
              onPress={premium ? onOpenNotebook : onOpenPaywall}
              style={({ pressed }) => [styles.notebookLink, pressed && { opacity: 0.7 }]}>
              <SymbolView
                name={premium ? 'book.closed' : 'lock.fill'}
                size={12}
                tintColor={theme.tintDeep}
              />
              <ThemedText type="smallBold" style={{ fontSize: 12, color: theme.tintDeep }}>
                {premium ? '観察手帳をひらく' : 'ホトリの見立てを読む(プレミアム)'}
              </ThemedText>
              <SymbolView name="chevron.right" size={10} tintColor={theme.tintDeep} />
            </Pressable>
          </View>
        </PopIn>
        <PopIn delay={1200}>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {previewText}
          </ThemedText>
        </PopIn>
      </View>

      <View style={styles.bottom}>
        <Button title="来週の歩幅を決める" onPress={() => setStep('pace')} />
        <Button title="そのまま閉じる" variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', lineHeight: 28 },
  card: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.one,
    alignSelf: 'stretch',
  },
  cardText: { lineHeight: 21 },
  teaserHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  teaserLabel: { fontSize: 12, fontWeight: '700' },
  notebookLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    paddingTop: 2,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.two },
  bottom: { gap: Spacing.one, paddingBottom: Spacing.two },
});
