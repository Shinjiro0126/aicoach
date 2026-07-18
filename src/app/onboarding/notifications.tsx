import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingNav } from '@/components/onboarding-steps';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { requestNotificationPermission } from '@/lib/notifications';
import { useAppStore } from '@/stores/app';

const MORNING_OPTIONS = [6, 7, 8, 9];
const EVENING_OPTIONS = [20, 21, 22, 23];

export default function NotificationSetupScreen() {
  const theme = useTheme();
  const { morningTime, eveningTime, setNotificationTimes, setNotificationsEnabled } = useAppStore();
  const [morning, setMorning] = useState(morningTime.hour);
  const [evening, setEvening] = useState(eveningTime.hour);

  const next = async (enable: boolean) => {
    setNotificationTimes({ hour: morning, minute: 0 }, { hour: evening, minute: 30 });
    if (enable) {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
    } else {
      setNotificationsEnabled(false);
    }
    router.push('/onboarding/plan');
  };

  return (
    <Screen scroll>
      <OnboardingNav current={5} />

      <View style={styles.header}>
        <ThemedText type="subtitle">リマインドの時間を{'\n'}決めましょう</ThemedText>
        <ThemedText themeColor="textSecondary">
          続けるコツは「思い出すきっかけ」。朝の行動リマインドと、夜の振り返りの2回だけ通知します。
        </ThemedText>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionLabel}>
          <SymbolView name="sun.horizon" size={16} tintColor={theme.warning} />
          <ThemedText type="smallBold">朝のリマインド</ThemedText>
        </View>
        <View style={styles.chips}>
          {MORNING_OPTIONS.map((h) => (
            <Chip key={h} label={`${h}:00`} selected={morning === h} onPress={() => setMorning(h)} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionLabel}>
          <SymbolView name="moon.stars" size={16} tintColor={theme.tint} />
          <ThemedText type="smallBold">夜の振り返り</ThemedText>
        </View>
        <View style={styles.chips}>
          {EVENING_OPTIONS.map((h) => (
            <Chip key={h} label={`${h}:30`} selected={evening === h} onPress={() => setEvening(h)} />
          ))}
        </View>
      </View>

      <Button title="通知をオンにして次へ" onPress={() => next(true)} />
      <Button title="あとで設定する" variant="ghost" onPress={() => next(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginTop: Spacing.three },
  section: { gap: Spacing.two },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
