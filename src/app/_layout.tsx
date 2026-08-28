import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { initPostHog } from '@/lib/analytics/posthog';
import { toDateKey } from '@/lib/dates';
import { scheduleDailyNotifications } from '@/lib/notifications';
import { initSentry, wrapWithSentry } from '@/lib/observability/sentry';
import { useAppStore } from '@/stores/app';

SplashScreen.preventAutoHideAsync();
initSentry();

function RootLayout() {
  const colorScheme = useColorScheme();
  const goalLoaded = useAppStore((s) => s.goalLoaded);
  const loadGoal = useAppStore((s) => s.loadGoal);

  useEffect(() => {
    loadGoal();
  }, [loadGoal]);

  useEffect(() => {
    if (goalLoaded) SplashScreen.hideAsync();
  }, [goalLoaded]);

  // 起動時に通知を再スケジュールする(通知ON かつ アクティブ目標がある場合のみ)。
  // 通知定義の追加・変更(旗の日の週次通知など)を、設定画面を触らない既存ユーザーにも
  // アプリ更新後の初回起動で反映するための経路。設定値は永続ストアの復元完了後に読む。
  // 通知ONは過去に権限許可済みであることを意味するため、ここでは権限ダイアログを出さない
  useEffect(() => {
    const reschedule = () => {
      const { notificationsEnabled, activeGoal, morningTime, eveningTime } = useAppStore.getState();
      if (!notificationsEnabled || !activeGoal) return;
      scheduleDailyNotifications(
        activeGoal.title,
        morningTime,
        eveningTime,
        toDateKey(new Date(activeGoal.createdAt)),
      ).catch(() => {});
    };
    if (useAppStore.persist.hasHydrated()) {
      reschedule();
      return;
    }
    return useAppStore.persist.onFinishHydration(reschedule);
  }, []);

  // 匿名の deviceId が確定(永続化ストアの復元完了)次第、行動分析を初期化する
  useEffect(() => {
    if (useAppStore.persist.hasHydrated()) {
      initPostHog(useAppStore.getState().deviceId);
      return;
    }
    return useAppStore.persist.onFinishHydration((state) => initPostHog(state.deviceId));
  }, []);

  if (!goalLoaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notebook" />
      </Stack>
    </ThemeProvider>
  );
}

export default wrapWithSentry(RootLayout);
