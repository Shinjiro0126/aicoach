import { SymbolView } from 'expo-symbols';
import { StyleSheet, Switch, View } from 'react-native';

import { SubScreenHeader } from '@/components/sub-screen-header';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useApplyNotifications } from '@/hooks/use-apply-notifications';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

const MORNING_OPTIONS = [6, 7, 8, 9];
const EVENING_OPTIONS = [20, 21, 22, 23];

/**
 * 通知設定のサブ画面。旧設定タブの通知スイッチ+時刻チップUIをそのまま移設した
 * (スケジュール反映ロジックは useApplyNotifications。挙動変更なし)
 */
export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const { morningTime, eveningTime, notificationsEnabled, setNotificationTimes } = useAppStore();
  const applyNotifications = useApplyNotifications();

  const setMorning = (hour: number) => {
    const morning = { hour, minute: 0 };
    setNotificationTimes(morning, eveningTime);
    if (notificationsEnabled) applyNotifications(true, morning, eveningTime);
  };

  const setEvening = (hour: number) => {
    const evening = { hour, minute: 30 };
    setNotificationTimes(morningTime, evening);
    if (notificationsEnabled) applyNotifications(true, morningTime, evening);
  };

  return (
    <Screen scroll>
      <SubScreenHeader title="通知" />

      <Card>
        <View style={styles.row}>
          <ThemedText type="smallBold">通知</ThemedText>
          <Switch
            value={notificationsEnabled}
            onValueChange={(v) => applyNotifications(v)}
            trackColor={{ true: theme.tint }}
          />
        </View>
        {notificationsEnabled && (
          <>
            <View style={styles.sectionLabel}>
              <SymbolView name="sun.horizon" size={14} tintColor={theme.warning} />
              <ThemedText type="small" themeColor="textSecondary">
                朝のリマインド
              </ThemedText>
            </View>
            <View style={styles.chips}>
              {MORNING_OPTIONS.map((h) => (
                <Chip key={h} label={`${h}:00`} selected={morningTime.hour === h} onPress={() => setMorning(h)} />
              ))}
            </View>
            <View style={styles.sectionLabel}>
              <SymbolView name="moon.stars" size={14} tintColor={theme.tint} />
              <ThemedText type="small" themeColor="textSecondary">
                夜の振り返り
              </ThemedText>
            </View>
            <View style={styles.chips}>
              {EVENING_OPTIONS.map((h) => (
                <Chip key={h} label={`${h}:30`} selected={eveningTime.hour === h} onPress={() => setEvening(h)} />
              ))}
            </View>
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
