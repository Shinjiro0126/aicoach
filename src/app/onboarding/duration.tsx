import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Pressable, View } from 'react-native';

import { StepDots } from '@/components/onboarding-steps';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useOnboardingStore } from '@/stores/onboarding';

/** 達成期間のプリセット(MVPは4種のみ。日付指定は未実装) */
const DURATION_OPTIONS: { months: number; label: string; description: string; popular?: boolean }[] = [
  { months: 1, label: '1ヶ月', description: '短期集中で一気に仕上げる' },
  { months: 3, label: '3ヶ月', description: '一番選ばれている期間です', popular: true },
  { months: 6, label: '6ヶ月', description: 'じっくり無理なく取り組む' },
  { months: 12, label: '1年', description: '長期的な習慣づくり' },
];

export default function DurationScreen() {
  const theme = useTheme();
  const { durationMonths, setDurationMonths } = useOnboardingStore();

  return (
    <Screen scroll>
      <StepDots current={2} />

      <View style={styles.header}>
        <ThemedText type="subtitle">いつまでに{'\n'}達成したいですか?</ThemedText>
        <ThemedText themeColor="textSecondary">
          期限を決めると、コーチが逆算して計画を立てます。
        </ThemedText>
      </View>

      <View style={styles.options}>
        {DURATION_OPTIONS.map((opt) => {
          const selected = durationMonths === opt.months;
          return (
            <Pressable
              key={opt.months}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setDurationMonths(opt.months)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selected ? theme.tintSoft : theme.backgroundElement,
                  borderColor: selected ? theme.tint : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <View style={[styles.radio, { borderColor: selected ? theme.tint : theme.textSecondary }]}>
                {selected && <View style={[styles.radioInner, { backgroundColor: theme.tint }]} />}
              </View>
              <View style={styles.optionBody}>
                <View style={styles.optionTitleRow}>
                  <ThemedText type="smallBold" style={{ fontSize: 16 }}>
                    {opt.label}
                  </ThemedText>
                  {opt.popular && (
                    <View style={[styles.popularBadge, { backgroundColor: theme.tint }]}>
                      <ThemedText type="small" style={{ color: theme.onTint, fontSize: 11, lineHeight: 14 }}>
                        人気
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {opt.description}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.hint}>
        <SymbolView name="lightbulb" size={18} tintColor={theme.warning} />
        <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
          迷ったら3ヶ月が目安です。習慣が定着して、成果も実感しやすい長さです。
        </ThemedText>
      </Card>

      <Button title="次へ" onPress={() => router.push('/onboarding/why')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginTop: Spacing.three },
  options: { gap: Spacing.two },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: Spacing.three,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 12, height: 12, borderRadius: 999 },
  optionBody: { flex: 1, gap: Spacing.half },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  popularBadge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
