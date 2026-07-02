import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const MORNING_ID = 'daily-morning-reminder';
const EVENING_ID = 'daily-evening-reflection';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

/** 朝リマインド・夜振り返りのデイリー通知を(再)スケジュールする */
export async function scheduleDailyNotifications(
  goalTitle: string,
  morning: { hour: number; minute: number },
  evening: { hour: number; minute: number },
): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelDailyNotifications();
  await Notifications.scheduleNotificationAsync({
    identifier: MORNING_ID,
    content: {
      title: '今日の一歩 🌱',
      body: `「${goalTitle}」— 今日の最小行動を確認しましょう`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: morning.hour,
      minute: morning.minute,
    },
  });
  await Notifications.scheduleNotificationAsync({
    identifier: EVENING_ID,
    content: {
      title: '今日はどうでしたか?',
      body: 'コーチと1分だけ振り返りましょう',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: evening.hour,
      minute: evening.minute,
    },
  });
}

export async function cancelDailyNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(MORNING_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(EVENING_ID).catch(() => {});
}
