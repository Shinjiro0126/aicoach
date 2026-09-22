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
      // 非選択はダーク=白/ライト=黒、選択中(アクティブ)はブランドの水辺ブルーで際立たせる。
      // ピル(ダークは一段明るいbackgroundSelected)と青のアイコンの二段構えで現在地を示す
      indicatorColor={isDark ? colors.backgroundSelected : colors.backgroundElement}
      iconColor={{ default: isDark ? '#FFFFFF' : colors.text, selected: colors.tint }}
      labelStyle={{
        default: { color: isDark ? '#FFFFFF' : colors.text },
        selected: { color: colors.tint },
      }}>
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
