/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * ブランドカラー「水辺ブルー」。
 * - tint: 主色(水辺ブルー / ダークは月夜ブルー)
 * - tintDeep: 深瀬ブルー。威厳・見出し・強調テキスト用
 * - tintSoft: 浅瀬ソフト。面(カード・バブル)用
 * - sand / sandText: 砂浜サンド。動機カードなど温かみを出す面用
 */
export const Colors = {
  light: {
    text: '#16232C',
    background: '#ffffff',
    backgroundElement: '#EFF4F7',
    backgroundSelected: '#DEEAF1',
    textSecondary: '#5C6E7A',
    tint: '#2E9FD6',
    tintSoft: '#E3F4FC',
    tintDeep: '#17638F',
    onTint: '#FFFFFF',
    sand: '#F6EFE3',
    sandText: '#6B5636',
    danger: '#DC2626',
    warning: '#D97706',
    border: '#DFE8ED',
  },
  dark: {
    text: '#F2F6F8',
    background: '#000000',
    backgroundElement: '#1B2329',
    backgroundSelected: '#263440',
    textSecondary: '#9FB1BC',
    tint: '#5FC2EE',
    tintSoft: '#0D2B3C',
    tintDeep: '#8FD4F4',
    onTint: '#04202E',
    sand: '#2A241B',
    sandText: '#D8C29A',
    danger: '#F87171',
    warning: '#FBBF24',
    border: '#263038',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
