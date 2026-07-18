import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import type { WeekFlagInfo, WeekSegments } from '@/lib/progress';

type ProgressCardProps = {
  /** 主役: 今週の旗までの日ドット */
  week: WeekFlagInfo;
  /** 脇役: 全体の週セグメントバー */
  segments: WeekSegments;
  /** 50%境で切り替わる進捗コピー(progressSummary の copyMain / copySub) */
  copyMain: string;
  copySub: string;
  /** 祝い演出用: 今日のドットを遅れてpopさせる(reduce motion時は静止表示) */
  popTodayDot?: boolean;
};

/** 今日のドット。popTodayDot 時は遅れてスケールイン(達成が「増えた」ことを見せる) */
function TodayDot({ done, pop, color }: { done: boolean; pop: boolean; color: string }) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(pop && !reduceMotion ? 0.3 : 1);
  const opacity = useSharedValue(pop && !reduceMotion ? 0 : 1);

  useEffect(() => {
    if (reduceMotion) {
      // reduce motion は非同期に検出されるため、アニメーション開始後に有効化が反映されることがある。
      // その場合も途中値で不可視のまま固まらないよう、最終値を明示的にセットして静止表示にする
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    if (pop) {
      scale.value = withDelay(1100, withTiming(1, { duration: 550, easing: Easing.out(Easing.back(2.2)) }));
      opacity.value = withDelay(1100, withTiming(1, { duration: 250 }));
    }
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [pop, reduceMotion, scale, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  if (!done) return <View style={[styles.dot, { backgroundColor: color }]} />;
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/**
 * 進捗カード(ホームv2)。
 * 主役=今週の旗まで7日ドット(近接ゴール)、脇役=全体の週セグメントバー(位置づけだけ見せる)。
 */
export function ProgressCard({ week, segments, copyMain, copySub, popTodayDot }: ProgressCardProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.headRow}>
        <ThemedText type="smallBold">今週の旗まで</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {week.doneCount}/7 日
        </ThemedText>
      </View>

      <View style={styles.dotsRow}>
        {week.dots.map((dot) =>
          dot.isToday ? (
            <TodayDot
              key={dot.dateKey}
              done={dot.done}
              pop={Boolean(popTodayDot && dot.done)}
              color={dot.done ? theme.tint : theme.backgroundSelected}
            />
          ) : (
            <View
              key={dot.dateKey}
              style={[styles.dot, { backgroundColor: dot.done ? theme.tint : theme.backgroundSelected }]}
            />
          ),
        )}
        <View style={styles.flag}>
          <SymbolView name="flag.fill" size={16} tintColor={theme.tintDeep} />
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.segRow}>
        {Array.from({ length: segments.total }, (_, i) => {
          if (i < segments.currentIndex) {
            return <View key={i} style={[styles.seg, { backgroundColor: theme.tint }]} />;
          }
          if (i === segments.currentIndex) {
            return (
              <View key={i} style={[styles.seg, { backgroundColor: theme.backgroundSelected, overflow: 'hidden' }]}>
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { width: `${Math.round(segments.fraction * 100)}%`, backgroundColor: theme.tint, borderRadius: 3 },
                  ]}
                />
              </View>
            );
          }
          return <View key={i} style={[styles.seg, { backgroundColor: theme.backgroundSelected }]} />;
        })}
        <SymbolView name="flag.fill" size={13} tintColor={theme.tintDeep} />
      </View>

      <View style={styles.copyRow}>
        <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
          {copyMain}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          ・
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {copySub}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two + 1 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 18, height: 18, borderRadius: 9 },
  flag: { marginLeft: 'auto' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  segRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  seg: { flex: 1, height: 8, borderRadius: 3 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexWrap: 'wrap' },
});
