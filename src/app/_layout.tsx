import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance } from 'react-native';

import { LaunchOverlay } from '@/components/launch-overlay';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  const themePreference = useAppStore((s) => s.themePreference);

  useEffect(() => {
    loadGoal();
  }, [loadGoal]);

  // アプリの外観設定をOSレベルのトレイトにも反映する(Issue #58)。
  // これが無いと、リキッドグラスのタブバーやネイティブAlertはOSの外観に従い、
  // 「アプリはライトなのにタブだけ暗い」という食い違いが起きる
  // (iOS 26のリキッドグラスは blurEffect 指定を無視してトレイトに従うため、
  //  JS側の色指定だけでは揃えられない)
  useEffect(() => {
    // RN 0.86の型では「システム追従に戻す」は null ではなく 'unspecified'
    Appearance.setColorScheme(themePreference === 'system' ? 'unspecified' : themePreference);
  }, [themePreference]);

  // ネイティブスプラッシュはローディングオーバーレイの初回描画後に隠し、
  // 「ネイティブスプラッシュ → オーバーレイ → アプリ」を白画面を挟まずにつなぐ
  const handleOverlayShown = () => {
    // 既に隠れている等で失敗しても起動継続に影響させない
    SplashScreen.hideAsync().catch(() => {});
  };

  // 起動時に通知を再スケジュールする(通知ON かつ アクティブ目標がある場合のみ)。
  // 通知定義の追加・変更(旗の日の週次通知など)を、設定画面を触らない既存ユーザーにも
  // アプリ更新後の初回起動で反映するための経路。設定値は永続ストアの復元完了後に読む。
  // 通知ONは過去に権限許可済みであることを意味するため、ここでは権限ダイアログを出さない
  useEffect(() => {
    const reschedule = () => {
      const { notificationsEnabled, activeGoal, morningTime, eveningTime, premium } = useAppStore.getState();
      if (!notificationsEnabled || !activeGoal) return;
      scheduleDailyNotifications(
        activeGoal.title,
        morningTime,
        eveningTime,
        toDateKey(new Date(activeGoal.createdAt)),
        premium,
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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* style="auto" だとOS設定に追従してしまうため、外観設定を反映した解決後テーマに合わせる */}
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {/* 目標の読み込み前はオーバーレイだけを描画する(従来の return null と同じ扱い) */}
      {goalLoaded && (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          <Stack.Screen name="notebook" />
        </Stack>
      )}
      {/* コールドスタート時のブランドローディング。ルートレイアウトのマウント時に
          一度だけ表示され、バックグラウンド復帰では再表示されない */}
      <LaunchOverlay ready={goalLoaded} onShown={handleOverlayShown} />
    </ThemeProvider>
  );
}

export default wrapWithSentry(RootLayout);
