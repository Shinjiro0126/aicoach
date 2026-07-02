import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { Config } from '@/constants/config';
import { useTheme } from '@/hooks/use-theme';

const BENEFITS = [
  ['♾️', 'AIコーチとの対話が無制限に'],
  ['📊', '週次レビューで1週間をまとめて振り返り'],
  ['🎯', '複数の目標を同時に進行(近日提供)'],
] as const;

export default function PaywallScreen() {
  const theme = useTheme();

  return (
    <Screen scroll>
      <ThemedText type="subtitle" style={{ marginTop: Spacing.three }}>
        プレミアムで{'\n'}もっと深く伴走
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        無料プランではAIコーチとの対話は1日{Config.freeDailyMessageLimit}回までです。
      </ThemedText>

      <View style={{ gap: Spacing.two }}>
        {BENEFITS.map(([icon, text]) => (
          <Card key={text} style={styles.benefit}>
            <ThemedText style={{ fontSize: 24 }}>{icon}</ThemedText>
            <ThemedText style={{ flex: 1 }}>{text}</ThemedText>
          </Card>
        ))}
      </View>

      <Card style={{ backgroundColor: theme.tintSoft, alignItems: 'center' }}>
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          月額 ¥600(予定)
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          いつでもキャンセルできます
        </ThemedText>
      </Card>

      {/* TODO: RevenueCat (react-native-purchases) 接続後に購入フローを有効化する */}
      <Button title="購入機能は準備中です" disabled onPress={() => {}} />
      <Button title="閉じる" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
