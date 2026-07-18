import { SymbolView } from 'expo-symbols';
import { useEffect, type ReactNode } from 'react';
import { Animated, StyleSheet, useAnimatedValue, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';

/**
 * ゴールまでの道のりを縦タイムラインで表示する共通コンポーネント。
 * オンボーディング(plan.tsx)とホームのロードマップカードで共有する。
 */
export type RoadmapJourneyProps = {
  /** 今日の最初の一歩。指定時は先頭に「現在地」ノードとして表示する(オンボーディング用) */
  todayStep?: string;
  /** 第1〜4週のフォーカス文 */
  weeklyFocus: string[];
  goalTitle: string;
  /** ゴールノードのラベル(例: 「3ヶ月後のゴール」) */
  goalLabel: string;
  /** 現在の週番号(1-based)。指定時はその週を現在地としてハイライトし、前の週はチェックにする(ホーム用) */
  currentWeek?: number;
  /** 表示時に上から順にフェードインする(reduce motion 設定時は無効化) */
  animateIn?: boolean;
};

const NODE_SIZE = 36;

/** 現在地ノードの後ろで広がるパルスアニメーション */
function PulseRing({ color, animate }: { color: string; animate: boolean }) {
  const scale = useAnimatedValue(1);
  const opacity = useAnimatedValue(0.5);

  useEffect(() => {
    if (!animate) {
      opacity.setValue(0);
      return;
    }
    opacity.setValue(0.5);
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.7, duration: 1400, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 1400, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, scale, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pulse, { backgroundColor: color, transform: [{ scale }], opacity }]}
    />
  );
}

/** タイムライン各行を上から順にフェードインさせるラッパー */
function FadeInRow({ index, animate, children }: { index: number; animate: boolean; children: ReactNode }) {
  const opacity = useAnimatedValue(animate ? 0 : 1);
  const translateY = useAnimatedValue(animate ? 10 : 0);

  useEffect(() => {
    if (!animate) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 360, delay: index * 150, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 360, delay: index * 150, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [animate, index, opacity, translateY]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

type RowProps = {
  node: ReactNode;
  /** 現在地ノードならパルスを付ける */
  pulse?: boolean;
  pulseColor?: string;
  pulseAnimate?: boolean;
  isLast?: boolean;
  lineColor: string;
  children: ReactNode;
};

function TimelineRow({ node, pulse, pulseColor, pulseAnimate, isLast, lineColor, children }: RowProps) {
  return (
    <View style={styles.rowContainer}>
      <View style={styles.nodeColumn}>
        <View style={styles.nodeWrap}>
          {pulse && pulseColor ? <PulseRing color={pulseColor} animate={pulseAnimate ?? false} /> : null}
          {node}
        </View>
        {!isLast && <View style={[styles.line, { backgroundColor: lineColor }]} />}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

export function RoadmapJourney({
  todayStep,
  weeklyFocus,
  goalTitle,
  goalLabel,
  currentWeek,
  animateIn = false,
}: RoadmapJourneyProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const animate = animateIn && !reduceMotion;

  let rowIndex = 0;

  return (
    <View>
      {todayStep !== undefined && (
        <FadeInRow index={rowIndex++} animate={animate}>
          <TimelineRow
            node={
              <View style={[styles.node, { backgroundColor: theme.tint }]}>
                <SymbolView name="chevron.right" size={16} tintColor={theme.onTint} weight="bold" />
              </View>
            }
            pulse
            pulseColor={theme.tint}
            pulseAnimate={!reduceMotion}
            lineColor={theme.border}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              今日の最初の一歩
            </ThemedText>
            <View style={[styles.stepCard, { backgroundColor: theme.tintSoft }]}>
              <ThemedText>{todayStep}</ThemedText>
            </View>
          </TimelineRow>
        </FadeInRow>
      )}

      {weeklyFocus.map((focus, i) => {
        const weekNo = i + 1;
        const isDone = currentWeek !== undefined && weekNo < currentWeek;
        const isCurrent = currentWeek !== undefined && weekNo === currentWeek;
        return (
          <FadeInRow key={weekNo} index={rowIndex++} animate={animate}>
            <TimelineRow
              node={
                isDone || isCurrent ? (
                  <View style={[styles.node, { backgroundColor: theme.tint }]}>
                    <SymbolView
                      name={isDone ? 'checkmark' : 'chevron.right'}
                      size={16}
                      tintColor={theme.onTint}
                      weight="bold"
                    />
                  </View>
                ) : (
                  <View style={[styles.node, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {weekNo}
                    </ThemedText>
                  </View>
                )
              }
              pulse={isCurrent}
              pulseColor={theme.tint}
              pulseAnimate={!reduceMotion}
              lineColor={theme.border}>
              <ThemedText
                type="smallBold"
                style={{ color: isCurrent ? theme.tint : theme.textSecondary }}>
                第{weekNo}週{isCurrent ? '(いま)' : ''}
              </ThemedText>
              {isCurrent ? (
                <View style={[styles.stepCard, { backgroundColor: theme.tintSoft }]}>
                  <ThemedText>{focus}</ThemedText>
                </View>
              ) : (
                <ThemedText themeColor={isDone ? 'textSecondary' : 'text'}>{focus}</ThemedText>
              )}
            </TimelineRow>
          </FadeInRow>
        );
      })}

      <FadeInRow index={rowIndex++} animate={animate}>
        <TimelineRow
          node={
            <View style={[styles.node, styles.goalNode, { backgroundColor: theme.tintSoft, borderColor: theme.tint }]}>
              <SymbolView name="flag.fill" size={16} tintColor={theme.tint} />
            </View>
          }
          isLast
          lineColor={theme.border}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {goalLabel}
          </ThemedText>
          <View style={[styles.stepCard, styles.goalCard, { borderColor: theme.tint }]}>
            <ThemedText style={{ fontWeight: '700' }}>{goalTitle}</ThemedText>
          </View>
        </TimelineRow>
      </FadeInRow>
    </View>
  );
}

const styles = StyleSheet.create({
  rowContainer: { flexDirection: 'row', gap: Spacing.three },
  nodeColumn: { width: NODE_SIZE, alignItems: 'center' },
  nodeWrap: { width: NODE_SIZE, height: NODE_SIZE, alignItems: 'center', justifyContent: 'center' },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalNode: { borderWidth: 1.5 },
  pulse: { position: 'absolute', width: NODE_SIZE, height: NODE_SIZE, borderRadius: 999 },
  line: { flex: 1, width: 2, borderRadius: 1, marginVertical: Spacing.one, minHeight: Spacing.three },
  content: { flex: 1, gap: Spacing.one, paddingBottom: Spacing.four },
  stepCard: { borderRadius: 12, padding: Spacing.three, marginTop: Spacing.one },
  goalCard: { borderWidth: 1.5 },
});
