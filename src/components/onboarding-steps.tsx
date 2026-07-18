import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** オンボーディングの総ステップ数(カテゴリ/目標/現在地/期間/動機/通知) */
export const ONBOARDING_TOTAL_STEPS = 6;

type StepDotsProps = {
  /** 0-based の現在ステップ */
  current: number;
  /** 総ステップ数 */
  total?: number;
};

/** ステップドット。現在位置は横長のtint色 */
export function StepDots({ current, total = ONBOARDING_TOTAL_STEPS }: StepDotsProps) {
  const theme = useTheme();
  return (
    <View style={styles.row} accessibilityLabel={`ステップ ${current + 1} / ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current
              ? { width: 24, backgroundColor: theme.tint }
              : { backgroundColor: i < current ? theme.tint : theme.backgroundSelected, opacity: i < current ? 0.35 : 1 },
          ]}
        />
      ))}
    </View>
  );
}

type OnboardingNavProps = StepDotsProps & {
  /** 最初の画面(カテゴリ)だけ false にして戻るを隠す */
  showBack?: boolean;
  /** 指定するとヘッダー右端にスキップリンクを表示する */
  onSkip?: () => void;
  skipLabel?: string;
};

/**
 * 全オンボーディング画面共通のナビヘッダー。
 * 左: 戻るchevron(44ptタップ領域) / 中央: ステップドット / 右: スキップ(任意)。
 * 入力はすべて useOnboardingStore に保持されるため、戻っても内容は消えない。
 */
export function OnboardingNav({
  current,
  total = ONBOARDING_TOTAL_STEPS,
  showBack = true,
  onSkip,
  skipLabel = 'スキップ',
}: OnboardingNavProps) {
  const theme = useTheme();
  return (
    <View style={styles.nav}>
      <View style={styles.side}>
        {showBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="前の画面に戻る"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.5 : 1 }]}>
            <SymbolView name="chevron.left" size={20} tintColor={theme.tintDeep} weight="semibold" />
          </Pressable>
        )}
      </View>
      <View style={styles.center}>
        <StepDots current={current} total={total} />
      </View>
      <View style={[styles.side, styles.sideRight]}>
        {onSkip && (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={onSkip}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <ThemedText type="small" themeColor="textSecondary">
              {skipLabel}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 999 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    marginTop: Spacing.two,
  },
  side: { width: 60, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
});
