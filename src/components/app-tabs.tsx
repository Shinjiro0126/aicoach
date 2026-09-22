import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[isDark ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      // ダークは黒背景に対してコントラストを確保する: 選択中ピルは一段明るい
      // backgroundSelected、非選択のアイコン・ラベルはOS既定の薄いグレーだと
      // 沈むため textSecondary を明示する(ライトは従来どおりOS既定に任せる)
      indicatorColor={isDark ? colors.backgroundSelected : colors.backgroundElement}
      iconColor={isDark ? { default: colors.textSecondary, selected: colors.text } : undefined}
      labelStyle={
        isDark
          ? { default: { color: colors.textSecondary }, selected: { color: colors.text } }
          : { selected: { color: colors.text } }
      }>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>今日</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checkmark.circle.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="coach">
        <NativeTabs.Trigger.Label>コーチ</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Label>記録</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>プロフィール</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
