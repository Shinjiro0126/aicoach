import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useAppStore } from '@/stores/app';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const goalLoaded = useAppStore((s) => s.goalLoaded);
  const loadGoal = useAppStore((s) => s.loadGoal);

  useEffect(() => {
    loadGoal();
  }, [loadGoal]);

  useEffect(() => {
    if (goalLoaded) SplashScreen.hideAsync();
  }, [goalLoaded]);

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
