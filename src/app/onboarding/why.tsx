import { router } from 'expo-router';
import { StyleSheet, TextInput, View } from 'react-native';

import { StepDots } from '@/components/onboarding-steps';
import { PrivacyBadge } from '@/components/privacy-badge';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useOnboardingStore } from '@/stores/onboarding';

export default function GoalWhyScreen() {
  const theme = useTheme();
  const { why, setWhy } = useOnboardingStore();

  return (
    <Screen scroll>
      <StepDots current={3} />

      <View style={styles.header}>
        <ThemedText type="subtitle">それを達成したいのは{'\n'}なぜですか?</ThemedText>
        <ThemedText themeColor="textSecondary">
          くじけそうな日、コーチがこの言葉を思い出させてくれます。
        </ThemedText>
      </View>

      <TextInput
        value={why}
        onChangeText={setWhy}
        placeholder="例: 海外で働くチャンスを掴みたいから"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        multiline
        maxLength={200}
        autoFocus
      />

      {/* 入力欄の直下に添えるプライバシーの一言。Screenのgap(16)を詰めて入力欄に寄せる */}
      <PrivacyBadge
        text="本音でどうぞ。この内容は、端末の外に保存されません"
        style={styles.privacy}
      />

      <Button
        title="次へ"
        disabled={why.trim().length === 0}
        onPress={() => router.push('/onboarding/notifications')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginTop: Spacing.three },
  privacy: { marginTop: -Spacing.two, paddingHorizontal: Spacing.one },
  input: {
    borderRadius: 14,
    padding: Spacing.three,
    fontSize: 18,
    minHeight: 120,
    textAlignVertical: 'top',
  },
});
