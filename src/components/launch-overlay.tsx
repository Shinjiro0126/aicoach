import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, useAnimatedValue } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import {
  LAUNCH_MIN_VISIBLE_MS,
  minVisibleRemainingMs,
  shouldDismissLaunchOverlay,
} from '@/lib/launch-gate';

/** フェードアウトの長さ(ms) */
const FADE_OUT_MS = 300;

const splashIcon = require('../../assets/images/splash-icon.png');

type Props = {
  /** アプリ本体の準備(目標の読み込み等)が完了したか */
  ready: boolean;
  /** オーバーレイの初回描画後に一度だけ呼ばれる(ネイティブスプラッシュを隠す合図) */
  onShown?: () => void;
};

/**
 * コールドスタート時のブランドローディング画面。
 * ネイティブスプラッシュ(app.json の expo-splash-screen 設定)と同じ背景色・アイコンで
 * 途切れなく引き継ぎ、準備完了と最小表示時間の両方を満たしたらフェードアウトする。
 * ルートレイアウトのマウント時に一度だけ表示される設計で、AppState の監視や
 * 復帰時の再表示ロジックを持たないため、バックグラウンド復帰では表示されない。
 */
export function LaunchOverlay({ ready, onShown }: Props) {
  const reduceMotion = useReduceMotion();
  const opacity = useAnimatedValue(1);
  const shownAtRef = useRef<number | null>(null);
  const notifiedRef = useRef(false);
  const [minVisibleReached, setMinVisibleReached] = useState(false);
  const [hidden, setHidden] = useState(false);

  // 最小表示時間の経過を計る。準備が先に終わってもここまでは表示を保持してチラつきを防ぐ
  useEffect(() => {
    shownAtRef.current = Date.now();
    const timer = setTimeout(() => setMinVisibleReached(true), minVisibleRemainingMs(0));
    return () => clearTimeout(timer);
  }, []);

  // 準備完了かつ最小表示時間を満たしたらフェードアウト。
  // reduce motion 設定時はフェードを省略して即切替(duration 0)にする
  useEffect(() => {
    const shownAt = shownAtRef.current;
    const elapsedMs = minVisibleReached
      ? LAUNCH_MIN_VISIBLE_MS
      : shownAt === null
        ? 0
        : Date.now() - shownAt;
    if (!shouldDismissLaunchOverlay({ ready, elapsedMs })) return;
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: reduceMotion ? 0 : FADE_OUT_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setHidden(true);
    });
    return () => animation.stop();
  }, [ready, minVisibleReached, reduceMotion, opacity]);

  if (hidden) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      onLayout={() => {
        if (notifiedRef.current) return;
        notifiedRef.current = true;
        onShown?.();
      }}
      accessibilityLabel="ホトリを準備しています"
    >
      <Image source={splashIcon} style={styles.icon} resizeMode="contain" />
      <Text style={styles.name}>ホトリ</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // ネイティブスプラッシュ(app.json: backgroundColor)と同じブランド色(水辺ブルー)で
    // 途切れなくつなぐ。テーマ非依存の固定色なので、外観設定がダーク固定でも
    // 直前のネイティブスプラッシュと同色のまま破綻しない
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    // app.json の imageWidth と同じ幅にして、ネイティブスプラッシュと同じ見た目を保つ
    width: 76,
    height: 76,
  },
  name: {
    marginTop: Spacing.three,
    color: Colors.light.onTint,
    fontFamily: Fonts.rounded,
    fontSize: 15,
    letterSpacing: 4,
  },
});
