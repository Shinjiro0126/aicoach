import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { SubScreenHeader } from '@/components/sub-screen-header';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { THEME_PREFERENCE_OPTIONS } from '@/lib/theme-preference';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

/**
 * 外観設定のサブ画面。旧設定タブの外観3択チップUIをそのまま移設した(挙動変更なし)
 */
export default function AppearanceSettingsScreen() {
  const theme = useTheme();
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);

  return (
    <Screen scroll>
      <SubScreenHeader title="外観" />

      <Card>
        <View style={styles.sectionLabel}>
          <SymbolView name="circle.lefthalf.filled" size={14} tintColor={theme.textSecondary} />
          <ThemedText type="smallBold">外観</ThemedText>
        </View>
        <View style={styles.chips}>
          {THEME_PREFERENCE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={themePreference === option.value}
              onPress={() => setThemePreference(option.value)}
            />
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
