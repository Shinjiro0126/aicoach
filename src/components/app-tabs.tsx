import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[isDark ? 'dark' : 'light'];

  return (
    <NativeTabs
      // ダークはタブバー自体を黒の70%にして、リキッドグラスの質感を3割だけ残しつつ
      // 黒っぽく沈ませる。ライトは従来どおり不透過の背景色
      backgroundColor={isDark ? 'rgba(0, 0, 0, 0.7)' : colors.background}
      // ダークは黒背景+白文字ではっきりさせる(選択中は一段明るいピルで区別)。
      // ライトは従来どおりOS既定+backgroundElementのまま
      indicatorColor={isDark ? colors.backgroundSelected : colors.backgroundElement}
      iconColor={isDark ? '#FFFFFF' : undefined}
      labelStyle={
        isDark
          ? { default: { color: '#FFFFFF' }, selected: { color: '#FFFFFF' } }
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
