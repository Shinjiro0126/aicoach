import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = ViewProps & {
  /** trueならScrollViewでラップ */
  scroll?: boolean;
  /** タブ画面ではタブバー分の余白を確保 */
  withTabInset?: boolean;
  /**
   * trueならキーボード表示時に画面を縮めて、下部のボタン等へ到達できるようにする
   * (自由入力のTextInputがある画面用。iOSはpadding方式)
   */
  keyboardAvoiding?: boolean;
};

/** SafeArea+背景色つきの画面コンテナ */
export function Screen({ scroll, withTabInset, keyboardAvoiding, style, children, ...rest }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + Spacing.two,
    paddingBottom: (withTabInset ? BottomTabInset : 0) + insets.bottom + Spacing.three,
  };

  const content = scroll ? (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, padding, style]}
      keyboardShouldPersistTaps="handled"
      {...rest}>
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, backgroundColor: theme.background }, styles.content, padding, style]} {...rest}>
      {children}
    </View>
  );

  if (keyboardAvoiding) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
});
