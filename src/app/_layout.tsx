import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { initPostHog } from '@/lib/analytics/posthog';
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
      </Stack>
    </ThemeProvider>
  );
}

export default wrapWithSentry(RootLayout);
