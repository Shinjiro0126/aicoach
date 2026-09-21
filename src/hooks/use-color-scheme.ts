import { useColorScheme as useSystemColorScheme } from 'react-native';

import { resolveColorScheme } from '@/lib/theme-preference';
import { useAppStore } from '@/stores/app';

/**
 * アプリ全体のカラースキーム解決の一元窓口。
 * ストアの外観設定(システムに合わせる / ライト / ダーク)を反映した実効テーマを返す。
 * react-native の useColorScheme を直接 import せず、必ずこのフックを使うこと
 * (直importすると外観設定が効かず OS 設定だけに追従してしまう)。
 * 戻り値の型は react-native 版と互換('light' | 'dark' のみ返すが、
 * 'unspecified' 等と比較している既存の呼び出し側もそのままコンパイルできる)
 */
export function useColorScheme(): ReturnType<typeof useSystemColorScheme> {
  const systemScheme = useSystemColorScheme();
  const themePreference = useAppStore((s) => s.themePreference);
  return resolveColorScheme(themePreference, systemScheme);
}
