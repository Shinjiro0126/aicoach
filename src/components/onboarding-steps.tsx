import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type StepDotsProps = {
  /** 0-based の現在ステップ */
  current: number;
  /** 総ステップ数(オンボーディングは5で統一) */
  total?: number;
};

/** オンボーディング各画面の上部に置くステップドット。現在位置は横長のtint色 */
export function StepDots({ current, total = 5 }: StepDotsProps) {
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 999 },
});
