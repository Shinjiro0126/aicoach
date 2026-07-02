import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = ViewProps & {
  /** trueならScrollViewでラップ */
  scroll?: boolean;
  /** タブ画面ではタブバー分の余白を確保 */
  withTabInset?: boolean;
};

/** SafeArea+背景色つきの画面コンテナ */
export function Screen({ scroll, withTabInset, style, children, ...rest }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + Spacing.two,
    paddingBottom: (withTabInset ? BottomTabInset : 0) + insets.bottom + Spacing.three,
  };

  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, padding, style]}
        keyboardShouldPersistTaps="handled"
        {...rest}>
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[{ flex: 1, backgroundColor: theme.background }, styles.content, padding, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
});
