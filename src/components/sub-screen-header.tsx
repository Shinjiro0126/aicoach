import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * プッシュ遷移するサブ画面の共通ヘッダー(戻る+タイトル)。
 * ルートスタックは headerShown: false のため、観察手帳と同じ
 * カスタムヘッダー方式で戻る導線を置く
 */
export function SubScreenHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="戻る" onPress={() => router.back()} hitSlop={10}>
        <SymbolView name="chevron.left" size={20} tintColor={theme.text} weight="semibold" />
      </Pressable>
      <ThemedText style={styles.headerTitle}>{title}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, marginTop: Spacing.two },
  headerTitle: { fontSize: 20, fontWeight: '800' },
});
