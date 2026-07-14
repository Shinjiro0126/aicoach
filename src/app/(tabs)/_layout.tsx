import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { useAppStore } from '@/stores/app';

export default function TabLayout() {
  const activeGoal = useAppStore((s) => s.activeGoal);
  if (!activeGoal) return <Redirect href="/onboarding/category" />;
  return <AppTabs />;
}
