import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  ALL_NOTIFICATION_IDS,
  buildNotificationPlans,
  type NotificationTime,
  type NotificationTrigger,
} from '@/lib/notification-plan';

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

/** 純関数側のトリガー表現を expo-notifications のトリガー入力へ変換する */
function toTriggerInput(trigger: NotificationTrigger): Notifications.SchedulableNotificationTriggerInput {
  if (trigger.type === 'daily') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: trigger.hour,
      minute: trigger.minute,
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday: trigger.weekday,
    hour: trigger.hour,
    minute: trigger.minute,
  };
}

/**
 * ローカル通知を(再)スケジュールする。内容の決定は lib/notification-plan.ts の純関数に一本化:
 * 朝リマインド・夜振り返り(デイリー)、旗の日の週次通知(昼12:00)、
 * そしてプレミアムのみ手帳更新通知(週初日の朝=朝リマインドの30分後)。
 * 先に全IDをキャンセルするため、プレミアムOFFで再スケジュールすると手帳通知は消える
 */
export async function scheduleDailyNotifications(
  goalTitle: string,
  morning: NotificationTime,
  evening: NotificationTime,
  startKey: string,
  premium: boolean,
): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelDailyNotifications();
  for (const plan of buildNotificationPlans(goalTitle, morning, evening, startKey, premium)) {
    await Notifications.scheduleNotificationAsync({
      identifier: plan.identifier,
      content: { title: plan.title, body: plan.body },
      trigger: toTriggerInput(plan.trigger),
    });
  }
}

/** 全通知の解除。手帳通知(プレミアム)も含む全IDを必ずキャンセルする */
export async function cancelDailyNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const id of ALL_NOTIFICATION_IDS) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
}
