import { SymbolView } from 'expo-symbols';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { ProgressCard } from '@/components/progress-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import type { WeekFlagInfo, WeekSegments } from '@/lib/progress';

/**
 * 提出直後の全画面祝い演出(デザイン03/03b)。
 * 泡の上昇+きらめき+celebrateホトリ(1回再生)+ストリーク数字の順次pop。
 * 自己ベスト更新時のみsandバッジ。reduce motion 時はすべて静止で全情報を表示する。
 */

type CelebrationProps = {
  streak: number;
  /** 自己ベスト更新時のみバッジを出す */
  isBest: boolean;
  week: WeekFlagInfo;
  segments: WeekSegments;
  copyMain: string;
  copySub: string;
  /** 「ホトリのひとことを聞く」→ コーチタブへ */
  onListen: () => void;
  onClose: () => void;
};

/** 遅延つきのスケールイン(プロトタイプの pop 相当)。reduce motion 時は即時表示 */
function PopIn({ delay, children }: { delay: number; children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) {
      progress.value = withDelay(
        delay,
        withTiming(1, { duration: 550, easing: Easing.out(Easing.back(2)) }),
      );
    }
    return () => cancelAnimation(progress);
  }, [delay, reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 2),
    transform: [{ scale: 0.3 + progress.value * 0.7 }],
  }));
  return <Animated.View style={[styles.popItem, style]}>{children}</Animated.View>;
}

/** 上昇して消える泡1粒(ループ) */
function Bubble({ left, size, delay, height }: { left: number; size: number; delay: number; height: number }) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 3400, easing: Easing.linear }), -1),
    );
    return () => cancelAnimation(progress);
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.12 ? progress.value * 7 : 0.85 * (1 - progress.value),
    transform: [{ translateY: -progress.value * height }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bubble,
        { left: `${left}%`, width: size, height: size, borderRadius: size / 2, backgroundColor: theme.tint },
        style,
      ]}
    />
  );
}

/** 明滅するきらめき。reduce motion 時は静止表示 */
function Sparkle({ top, left, size, delay }: { top: number; left: number; size: number; delay: number }) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(reduceMotion ? 0.8 : 0.15);

  useEffect(() => {
    if (!reduceMotion) {
      opacity.value = withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(1, { duration: 900 }), withTiming(0.15, { duration: 900 })),
          -1,
        ),
      );
    }
    return () => cancelAnimation(opacity);
  }, [delay, reduceMotion, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View pointerEvents="none" style={[styles.sparkle, { top: `${top}%`, left: `${left}%` }, style]}>
      <SymbolView name="sparkle" size={size} tintColor={theme.tint} />
    </Animated.View>
  );
}

const BUBBLES = [
  { left: 10, size: 10, delay: 0 },
  { left: 24, size: 7, delay: 1100 },
  { left: 46, size: 12, delay: 600 },
  { left: 68, size: 8, delay: 1700 },
  { left: 84, size: 11, delay: 300 },
  { left: 57, size: 6, delay: 2300 },
];

const SPARKLES = [
  { top: 12, left: 16, size: 16, delay: 0 },
  { top: 8, left: 76, size: 12, delay: 600 },
  { top: 26, left: 84, size: 14, delay: 1100 },
];

export function Celebration({ streak, isBest, week, segments, copyMain, copySub, onListen, onClose }: CelebrationProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const { height } = useWindowDimensions();

  return (
    <View style={styles.wrap}>
      {!reduceMotion && BUBBLES.map((b, i) => <Bubble key={i} {...b} height={height * 0.7} />)}
      {SPARKLES.map((s, i) => (
        <Sparkle key={i} {...s} />
      ))}

      <View style={styles.center}>
        <Hotori pose="celebrate" size={128} animate={reduceMotion ? undefined : 'celebrate'} />
        <PopIn delay={300}>
          <ThemedText style={styles.title}>今日の分、受け取りました!</ThemedText>
        </PopIn>
        <PopIn delay={600}>
          <View style={styles.streakRow}>
            <ThemedText style={[styles.streakBig, { color: theme.tintDeep }]}>{streak}</ThemedText>
            <ThemedText style={[styles.streakUnit, { color: theme.tintDeep }]}>日連続</ThemedText>
          </View>
          {isBest && (
            <View style={[styles.bestBadge, { backgroundColor: theme.sand }]}>
              <SymbolView name="flame.fill" size={13} tintColor={theme.sandText} />
              <ThemedText type="smallBold" style={{ color: theme.sandText }}>
                自己ベスト更新
              </ThemedText>
            </View>
          )}
        </PopIn>
        <PopIn delay={900}>
          <ProgressCard week={week} segments={segments} copyMain={copyMain} copySub={copySub} popTodayDot />
        </PopIn>
      </View>

      <View style={styles.bottom}>
        <Button title="ホトリのひとことを聞く" onPress={onListen} />
        <Button title="そのまま閉じる" variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  popItem: { alignItems: 'center', gap: Spacing.two, alignSelf: 'stretch' },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  streakRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one },
  streakBig: { fontSize: 46, fontWeight: '800', lineHeight: 52, fontVariant: ['tabular-nums'] },
  streakUnit: { fontSize: 16, fontWeight: '700' },
  bestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 10,
    paddingHorizontal: Spacing.two + 3,
    paddingVertical: Spacing.one + 1,
  },
  bottom: { gap: Spacing.one, paddingBottom: Spacing.two },
  bubble: { position: 'absolute', bottom: -24 },
  sparkle: { position: 'absolute' },
});
