import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PrivacyBadgeProps = {
  /** バッジ本文。省略時は保存ベースの標準文言 */
  text?: string;
  /** タグライン用途など、本文を強調したいときに true */
  bold?: boolean;
  /** 本文の下に添える補足行(省略可) */
  sub?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * プライバシーバッジ: lock.fill + 短い文言の控えめな一行表示。
 * 文言は「保存」ベースで書くこと(AI応答の生成時にメッセージは中継サーバー経由で
 * 送信されるため、「送信されません」という表現は虚偽になる)。
 */
export function PrivacyBadge({
  text = 'この内容は、端末の外に保存されません',
  bold = false,
  sub,
  style,
}: PrivacyBadgeProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        <SymbolView name="lock.fill" size={12} tintColor={theme.textSecondary} />
        <ThemedText type={bold ? 'smallBold' : 'small'} themeColor="textSecondary" style={styles.text}>
          {text}
        </ThemedText>
      </View>
      {sub !== undefined && (
        <ThemedText type="small" themeColor="textSecondary">
          {sub}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.half },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  text: { flexShrink: 1 },
});
