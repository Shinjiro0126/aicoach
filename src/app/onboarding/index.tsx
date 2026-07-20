import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { OnboardingNav } from '@/components/onboarding-steps';
import { PrivacyBadge } from '@/components/privacy-badge';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { getCategory } from '@/constants/categories';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useOnboardingStore } from '@/stores/onboarding';

/** 一度に表示するおすすめ候補の数 */
const VISIBLE_SUGGESTIONS = 3;

export default function GoalTitleScreen() {
  const theme = useTheme();
  const { category, title, setTitle } = useOnboardingStore();
  const [offset, setOffset] = useState(0);

  const cat = getCategory(category ?? 'other');
  const pool = cat.suggestions;
  const visible = Array.from(
    { length: Math.min(VISIBLE_SUGGESTIONS, pool.length) },
    (_, i) => pool[(offset + i) % pool.length],
  );

  return (
    // keyboardAvoiding: autoFocusでキーボードが出ても「AIのおすすめ」チップと「次へ」に到達できるようにする
    <Screen scroll keyboardAvoiding>
      <OnboardingNav current={1} />

      <View style={styles.header}>
        <View style={[styles.categoryPill, { backgroundColor: theme.tintSoft }]}>
          <SymbolView name={cat.symbol} size={14} tintColor={theme.tint} />
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {cat.label}
          </ThemedText>
        </View>
        <ThemedText type="subtitle">具体的にどんな目標を{'\n'}達成したいですか?</ThemedText>
        <ThemedText themeColor="textSecondary">
          AIコーチの「ホトリ」が毎日の小さな行動に分解して、達成まで伴走します。
        </ThemedText>
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={cat.placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        maxLength={60}
        autoFocus
      />

      <View style={styles.suggestHeader}>
        <View style={styles.suggestLabel}>
          <SymbolView name="sparkles" size={14} tintColor={theme.tint} />
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            AIのおすすめ
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOffset((n) => (n + VISIBLE_SUGGESTIONS) % pool.length)}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <ThemedText type="small" themeColor="textSecondary">
            別の提案
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.chips}>
        {visible.map((example) => (
          <Chip key={example} label={example} selected={title === example} onPress={() => setTitle(example)} />
        ))}
      </View>

      <View style={styles.bottomArea}>
        <PrivacyBadge />
        <Button
          title="次へ"
          disabled={title.trim().length === 0}
          onPress={() => router.push('/onboarding/hearing')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginTop: Spacing.three, alignItems: 'flex-start' },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  input: {
    borderRadius: 14,
    padding: Spacing.three,
    fontSize: 18,
    minHeight: 56,
  },
  suggestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  suggestLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  bottomArea: { gap: Spacing.two + Spacing.one, marginTop: Spacing.two },
});
