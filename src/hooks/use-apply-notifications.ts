import { Alert } from 'react-native';

import { toDateKey } from '@/lib/dates';
import {
  cancelDailyNotifications,
  requestNotificationPermission,
  scheduleDailyNotifications,
} from '@/lib/notifications';
import { useAppStore } from '@/stores/app';

/**
 * 通知のON/OFF・時刻・プレミアム状態の変更を通知スケジュールへ反映する。
 * 旧設定画面の applyNotifications をそのまま移設したもの(挙動変更なし)。
 * 通知サブ画面(スイッチ・時刻変更)とプロフィール画面([DEV]プレミアム切替)の
 * 両方から使うため共有フックにしている
 */
export function useApplyNotifications() {
  const { activeGoal, morningTime, eveningTime, premium, setNotificationsEnabled } = useAppStore();

  return async (
    enabled: boolean,
    morning = morningTime,
    evening = eveningTime,
    isPremium = premium,
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
    if (activeGoal)
      await scheduleDailyNotifications(
        activeGoal.title,
        morning,
        evening,
        toDateKey(new Date(activeGoal.createdAt)),
        isPremium,
      );
  };
}
