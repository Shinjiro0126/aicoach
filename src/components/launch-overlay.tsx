import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useAnimatedValue } from 'react-native';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import {
  LAUNCH_MIN_VISIBLE_MS,
  minVisibleRemainingMs,
  shouldDismissLaunchOverlay,
} from '@/lib/launch-gate';

/** フェードアウトの長さ(ms) */
const FADE_OUT_MS = 300;
/** 進捗バーが9割まで満ちるのにかける時間(ms)。残り1割は準備完了の合図で満たす */
const PROGRESS_CRUISE_MS = 2500;

// キービジュアル(852×1846)。タイトルロゴとキャッチコピーは描き込み済みなので
// ネイティブUIで重ねない。進捗バーとキャプションだけは実際の進行に合わせて
// 動かすため、画像には含めずここでネイティブ描画する
const launchHero = require('../../assets/images/launch-hero.jpg');

type Props = {
  /** アプリ本体の準備(目標の読み込み等)が完了したか */
  ready: boolean;
  /** オーバーレイの初回描画後に一度だけ呼ばれる(ネイティブスプラッシュを隠す合図) */
  onShown?: () => void;
};

/**
 * コールドスタート時のブランドローディング画面。
 * ホトリが川辺の道を散歩するフルスクリーンのキービジュアル1枚を表示し、
 * 準備完了と最小表示時間の両方を満たしたらフェードアウトする。
 * ルートレイアウトのマウント時に一度だけ表示される設計で、AppState の監視や
 * 復帰時の再表示ロジックを持たないため、バックグラウンド復帰では表示されない。
 */
export function LaunchOverlay({ ready, onShown }: Props) {
  const reduceMotion = useReduceMotion();
  const opacity = useAnimatedValue(1);
  const progress = useAnimatedValue(0);
  const shownAtRef = useRef<number | null>(null);
  const notifiedRef = useRef(false);
  const [minVisibleReached, setMinVisibleReached] = useState(false);
  const [hidden, setHidden] = useState(false);

  // 進捗バー: 表示中は9割までゆっくり満ち、準備完了の合図(フェード開始)で満タンになる。
  // 実際の読み込み進捗は計測できないため、体感に合わせた演出として動かす。
  // reduce motion 設定時はアニメーションせず満タンの静止表示にする
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 0.9,
      duration: PROGRESS_CRUISE_MS,
      easing: Easing.out(Easing.quad),
      // width の補間に使うため JS ドライバで動かす(小さなバー1本なので負荷は無視できる)
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, progress]);

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
    // フェードと同時に進捗バーを満タンにして「準備が終わった」合図にする
    const animation = Animated.parallel([
      Animated.timing(progress, {
        toValue: 1,
        duration: reduceMotion ? 0 : 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: reduceMotion ? 0 : FADE_OUT_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) setHidden(true);
    });
    return () => animation.stop();
  }, [ready, minVisibleReached, reduceMotion, opacity, progress]);

  if (hidden) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      // 装飾専用のオーバーレイなのでタッチを一切奪わない。
      // 特にフェードアウト中に下のアプリ本体への操作をブロックしないための指定
      pointerEvents="none"
      onLayout={() => {
        if (notifiedRef.current) return;
        notifiedRef.current = true;
        onShown?.();
      }}
      accessibilityLabel="ホトリを準備しています"
    >
      <Image source={launchHero} style={styles.hero} contentFit="cover" />
      <View style={styles.footer}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        <Text style={styles.caption}>今日も、いい一歩を。</Text>
      </View>
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
    // 画像アスペクト比(0.4615)とiPhoneの19.5:9はほぼ一致するためクロップは僅少だが、
    // 読み込みの一瞬や比率差で縁が見えた場合に備え、イラストの空に近い色を敷く
    backgroundColor: '#BEE3F5',
  },
  hero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // 進捗バーとキャプション。イラストの小道の上に重なるため、
  // 色はブランドの水辺ブルー系で固定する(このオーバーレイはテーマ非依存)
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 72,
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    width: '34%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#2E9FD6',
  },
  caption: {
    fontSize: 14,
    letterSpacing: 1,
    color: '#17638F',
  },
});
