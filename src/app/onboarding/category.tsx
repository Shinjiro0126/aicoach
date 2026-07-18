import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Hotori } from '@/components/hotori';
import { StepDots } from '@/components/onboarding-steps';
import { PrivacyBadge } from '@/components/privacy-badge';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { CATEGORIES } from '@/constants/categories';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AnalyticsEvent, trackEvent } from '@/lib/analytics/posthog';
import { useOnboardingStore } from '@/stores/onboarding';

/** オンボーディングの起点: 目標カテゴリの選択 */
export default function CategoryScreen() {
  const theme = useTheme();
  const { category, setCategory } = useOnboardingStore();

  useEffect(() => {
    trackEvent(AnalyticsEvent.OnboardingStarted);
  }, []);

  const next = () => {
    if (!category) return;
    // 送るのは定義済み enum 値のみ(自由入力は含まれない)
    trackEvent(AnalyticsEvent.CategorySelected, { category });
    router.push('/onboarding');
  };

  return (
    <Screen scroll>
      <StepDots current={0} />

      {/* ブランドメッセージ(タグライン)。画面を圧迫しない控えめなトーンで置く */}
      <PrivacyBadge
        text="あなたの目標は、この端末から出ない。"
        bold
        sub="記録も対話も、この iPhone の中だけに保存されます"
        style={styles.brandNote}
      />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Hotori pose="guide" size={64} />
          <ThemedText type="subtitle" style={{ flex: 1 }}>
            どんな分野で{'\n'}伴走しましょうか?
          </ThemedText>
        </View>
        <ThemedText themeColor="textSecondary">
          カテゴリに合わせて、コーチの視点や質問が変わります。
        </ThemedText>
      </View>

      <View style={styles.grid}>
        {CATEGORIES.map((c) => {
          const selected = category === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setCategory(c.id)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: selected ? theme.tintSoft : theme.backgroundElement,
                  borderColor: selected ? theme.tint : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              {selected && (
                <View style={[styles.checkBadge, { backgroundColor: theme.tint }]}>
                  <SymbolView name="checkmark" size={11} tintColor={theme.onTint} weight="bold" />
                </View>
              )}
              <View
                style={[
                  styles.iconTile,
                  { backgroundColor: selected ? theme.tint : theme.backgroundSelected },
                ]}>
                <SymbolView name={c.symbol} size={20} tintColor={selected ? theme.onTint : theme.textSecondary} />
              </View>
              <ThemedText type="smallBold">{c.label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {c.description}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Button title="次へ" disabled={!category} onPress={next} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandNote: { marginTop: Spacing.three },
  header: { gap: Spacing.two, marginTop: Spacing.three },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  card: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  checkBadge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
