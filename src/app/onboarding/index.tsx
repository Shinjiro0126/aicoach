import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AnalyticsEvent, trackEvent } from '@/lib/analytics/posthog';
import { useOnboardingStore } from '@/stores/onboarding';

const EXAMPLES = ['TOEICで800点を取る', '週3回ランニングする', '毎日30分 副業に取り組む', '5kg減量する'];

export default function GoalTitleScreen() {
  const theme = useTheme();
  const { title, setTitle } = useOnboardingStore();

  useEffect(() => {
    trackEvent(AnalyticsEvent.OnboardingStarted);
  }, []);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <ThemedText type="subtitle">達成したい目標は{'\n'}何ですか?</ThemedText>
        <ThemedText themeColor="textSecondary">
          AIコーチが毎日の小さな行動に分解して、達成まで伴走します。
        </ThemedText>
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="例: TOEICで800点を取る"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        maxLength={60}
        autoFocus
      />

      <View style={styles.chips}>
        {EXAMPLES.map((example) => (
          <Chip key={example} label={example} selected={title === example} onPress={() => setTitle(example)} />
        ))}
      </View>

      <Button title="次へ" disabled={title.trim().length === 0} onPress={() => router.push('/onboarding/why')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginTop: Spacing.five },
  input: {
    borderRadius: 14,
    padding: Spacing.three,
    fontSize: 18,
    minHeight: 56,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
