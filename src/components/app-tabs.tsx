import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[isDark ? 'dark' : 'light'];

  return (
    <NativeTabs
      // タブバーの地色は70%の半透過にして、リキッドグラスの質感を3割残す
      // (ダーク=黒の70%、ライト=白の70%)
      backgroundColor={isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)'}
      // ガラスの明暗をアプリの外観設定に強制追従させる。OS外観任せ(systemDefault)だと
      // 「アプリはライトなのにOSがダークでタブだけ暗い」という食い違いが起きる
      blurEffect={isDark ? 'systemMaterialDark' : 'systemMaterialLight'}
      // ダークは黒背景+白文字(選択中は一段明るいピルで区別)。
      // ライトはOSがダークでも白ガラス+黒文字で固定する
      indicatorColor={isDark ? colors.backgroundSelected : colors.backgroundElement}
      iconColor={isDark ? '#FFFFFF' : colors.text}
      labelStyle={
        isDark
          ? { default: { color: '#FFFFFF' }, selected: { color: '#FFFFFF' } }
          : { default: { color: colors.text }, selected: { color: colors.text } }
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
