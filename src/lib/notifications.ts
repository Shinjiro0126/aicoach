import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { flagDayNotificationWeekday } from '@/lib/flag-day';

const MORNING_ID = 'daily-morning-reminder';
const EVENING_ID = 'daily-evening-reflection';
const FLAG_ID = 'weekly-flag-day';

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

/**
 * 朝リマインド・夜振り返りのデイリー通知と、旗の日の週次通知を(再)スケジュールする。
 * 旗の日通知は目標開始日+6日の曜日に週1回、既存2通知と衝突しない昼12:00に鳴らす
 * (ローカル通知は週番号を動的更新できないため「第N週」は文面に入れない)
 */
export async function scheduleDailyNotifications(
  goalTitle: string,
  morning: { hour: number; minute: number },
  evening: { hour: number; minute: number },
  startKey: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelDailyNotifications();
  await Notifications.scheduleNotificationAsync({
    identifier: MORNING_ID,
    content: {
      title: '今日の一歩',
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
  await Notifications.scheduleNotificationAsync({
    identifier: FLAG_ID,
    content: {
      title: '今日は旗の日です',
      body: '今週の旗が、すぐそこにあります。今週の歩みを、見に来てください。',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: flagDayNotificationWeekday(startKey),
      hour: 12,
      minute: 0,
    },
  });
}

export async function cancelDailyNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(MORNING_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(EVENING_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(FLAG_ID).catch(() => {});
}
