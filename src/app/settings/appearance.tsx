import { StyleSheet, View } from 'react-native';

import { SubScreenHeader } from '@/components/sub-screen-header';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { THEME_PREFERENCE_OPTIONS } from '@/lib/theme-preference';
import { useAppStore } from '@/stores/app';

/**
 * 外観設定のサブ画面。旧設定タブの外観3択チップUIをそのまま移設した(挙動変更なし)
 */
export default function AppearanceSettingsScreen() {
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);

  return (
    <Screen scroll>
      <SubScreenHeader title="外観" />

      <Card>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
