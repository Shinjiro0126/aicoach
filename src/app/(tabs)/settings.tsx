import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Share, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { archiveGoal, deleteAllData, exportAllData } from '@/db/repo';
import {
  cancelDailyNotifications,
  requestNotificationPermission,
  scheduleDailyNotifications,
} from '@/lib/notifications';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

const MORNING_OPTIONS = [6, 7, 8, 9];
const EVENING_OPTIONS = [20, 21, 22, 23];

export default function SettingsScreen() {
  const theme = useTheme();
  const {
    activeGoal,
    morningTime,
    eveningTime,
    notificationsEnabled,
    premium,
    setNotificationTimes,
    setNotificationsEnabled,
    setPremium,
    setActiveGoal,
  } = useAppStore();

  const applyNotifications = async (
    enabled: boolean,
    morning = morningTime,
    evening = eveningTime,
  ) => {
    if (!enabled) {
      await cancelDailyNotifications();
      setNotificationsEnabled(false);
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert('通知が許可されていません', 'iOSの設定アプリから通知を許可してください。');
      setNotificationsEnabled(false);
      return;
    }
    setNotificationsEnabled(true);
    if (activeGoal) await scheduleDailyNotifications(activeGoal.title, morning, evening);
  };

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

  const exportData = async () => {
    await Share.share({ message: exportAllData(), title: 'コーチデータのエクスポート' });
  };

  const confirmDeleteAll = () => {
    Alert.alert('すべてのデータを削除', 'この操作は取り消せません。目標・記録・対話履歴がすべて削除されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          deleteAllData();
          await cancelDailyNotifications();
          setActiveGoal(null);
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const confirmArchiveGoal = () => {
    if (!activeGoal) return;
    Alert.alert('目標をリセット', '現在の目標をアーカイブして、新しい目標を設定します。記録は残ります。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'リセットする',
        onPress: () => {
          archiveGoal(activeGoal.id);
          setActiveGoal(null);
          router.replace('/onboarding');
        },
      },
    ]);
  };

  return (
    <Screen scroll withTabInset>
      <ThemedText type="subtitle" style={{ marginTop: Spacing.two }}>
        設定
      </ThemedText>

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
            <ThemedText type="small" themeColor="textSecondary">
              🌅 朝のリマインド
            </ThemedText>
            <View style={styles.chips}>
              {MORNING_OPTIONS.map((h) => (
                <Chip key={h} label={`${h}:00`} selected={morningTime.hour === h} onPress={() => setMorning(h)} />
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              🌙 夜の振り返り
            </ThemedText>
            <View style={styles.chips}>
              {EVENING_OPTIONS.map((h) => (
                <Chip key={h} label={`${h}:30`} selected={eveningTime.hour === h} onPress={() => setEvening(h)} />
              ))}
            </View>
          </>
        )}
      </Card>

      <Card>
        <View style={styles.row}>
          <ThemedText type="smallBold">プラン</ThemedText>
          <ThemedText type="small" style={{ color: premium ? theme.tint : theme.textSecondary }}>
            {premium ? 'プレミアム' : '無料プラン'}
          </ThemedText>
        </View>
        {!premium && <Button title="プレミアムを見る" variant="secondary" onPress={() => router.push('/paywall')} />}
        {__DEV__ && (
          <Button
            title={`[DEV] プレミアム切替 (現在: ${premium ? 'ON' : 'OFF'})`}
            variant="ghost"
            onPress={() => setPremium(!premium)}
          />
        )}
      </Card>

      <Card>
        <ThemedText type="smallBold">データ</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          すべてのデータはこの端末の中にだけ保存されています。サーバーには送信されません。
        </ThemedText>
        <Button title="データをエクスポート (JSON)" variant="secondary" onPress={exportData} />
        <Button title="目標をリセット" variant="secondary" onPress={confirmArchiveGoal} />
        <Button title="すべてのデータを削除" variant="danger" onPress={confirmDeleteAll} />
      </Card>

      <Card>
        <ThemedText type="smallBold">品質改善へのご協力</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          匿名の診断データ(クラッシュ情報・利用状況)を送信して品質改善に役立てています。個人を特定する情報や会話内容は送信されません。
        </ThemedText>
      </Card>

      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        バージョン {Constants.expoConfig?.version ?? '1.0.0'}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
