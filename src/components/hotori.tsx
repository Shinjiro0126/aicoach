import { useEffect, useId } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useReduceMotion } from '@/hooks/use-reduce-motion';

/**
 * コーチキャラクター「ホトリ」(威厳のあるカワウソ)。
 * SVGパーツ(頭・体・目・眉・口・腕・小物)の組み合わせでポーズを構成する。
 * パスデータとカラーはブランドプロトタイプ(docs/brand.md 参照)が原本。
 *
 * 使用例: <Hotori pose="celebrate" size={96} animate="celebrate" />
 * reduce motion 設定時はアニメーションを止めて静止ポーズを表示する。
 */

export type HotoriPose =
  | 'normal' // 通常: チャットのアバター、ヘッダー
  | 'guide' // 案内: オンボーディング、機能の初回説明
  | 'thinking' // 考え中: AI応答・計画の生成中
  | 'celebrate' // 喜び: 「できた!」直後、週の達成
  | 'encourage' // 励まし: 未達成の日の夜、背中を押すとき
  | 'sleep' // おやすみ: 夜の振り返り後
  | 'concern' // 心配: ストリーク救済、おかえりデー
  | 'applaud'; // 拍手: 目標達成、ストリーク節目

export type HotoriAnimation = 'idle' | 'celebrate' | 'thinking';

export type HotoriProps = {
  pose?: HotoriPose;
  /** 表示幅(px)。full は高さが size × 150/120 になる */
  size?: number;
  /** idle=瞬き+呼吸 / celebrate=跳ね+波紋 / thinking=泡。reduce motion 時は無効 */
  animate?: HotoriAnimation;
  /** full=全身 / bust=チャットアバター用の頭部+スカーフ(円形・グラデ背景つき) */
  variant?: 'full' | 'bust';
};

// ===== カラーパレット(キャラクター固有色。テーマに依らず固定) =====
const FUR = '#8B6B54'; // 毛色
const FUR_INNER = '#6E523E'; // 耳の内側・足・しっぽ
const FUR_BODY = '#7A5C47'; // 胴体
const CREAM = '#F0E4D2'; // 頬・腹の明るい毛色
const LINE = '#41302A'; // 鼻・口
const EYE = '#241A14';
const BROW = '#54402F';
const WHISKER = '#C9B79C';
const SCARF = '#1E7FB4'; // スカーフ(コーチの証)
const SCARF_TAIL = '#2E9FD6';
const BUBBLE = '#9DC3D9'; // 考え中の泡
const ZZZ = '#5B87A3';
const ACCENT = '#2E9FD6'; // キラキラ・波紋

// ===== パーツ =====

/** 頭(耳・輪郭・頬・鼻・ひげ) */
function Head() {
  return (
    <G>
      <Circle cx={30} cy={34} r={9} fill={FUR} />
      <Circle cx={30} cy={34} r={4} fill={FUR_INNER} />
      <Circle cx={90} cy={34} r={9} fill={FUR} />
      <Circle cx={90} cy={34} r={4} fill={FUR_INNER} />
      <Ellipse cx={60} cy={56} rx={36} ry={32} fill={FUR} />
      <Ellipse cx={60} cy={68} rx={23} ry={17} fill={CREAM} />
      <Path
        d="M55 61 h10 q1.6 0 1 1.5 l-4.4 5 q-1.6 1.8 -3.2 0 l-4.4 -5 q-0.6 -1.5 1 -1.5 Z"
        fill={LINE}
      />
      <G stroke={WHISKER} strokeWidth={1.4} strokeLinecap="round">
        <Line x1={34} y1={63} x2={20} y2={60} />
        <Line x1={34} y1={68} x2={20} y2={68} />
        <Line x1={86} y1={63} x2={100} y2={60} />
        <Line x1={86} y1={68} x2={100} y2={68} />
      </G>
    </G>
  );
}

/** 体(しっぽ・首・胴体・腹・足・スカーフ) */
function Body() {
  return (
    <G>
      <Ellipse cx={97} cy={131} rx={14} ry={6} fill={FUR_INNER} transform="rotate(-24 97 131)" />
      <Path d="M42 78 q18 12 36 0 v14 h-36 Z" fill={FUR} />
      <Ellipse cx={60} cy={112} rx={28} ry={26} fill={FUR_BODY} />
      <Ellipse cx={60} cy={119} rx={15} ry={14} fill={CREAM} />
      <Ellipse cx={46} cy={139} rx={8} ry={4.5} fill={FUR_INNER} />
      <Ellipse cx={74} cy={139} rx={8} ry={4.5} fill={FUR_INNER} />
      <Path d="M38 89 q22 -10 44 0 l-2.2 8.5 q-20 -8 -39.6 0 Z" fill={SCARF} />
      <Path d="M63 95 l10 3 -3 13 -9 -2.5 Z" fill={SCARF_TAIL} />
    </G>
  );
}

/** 眉2種(通常=太く水平気味で威厳 / 心配=ハの字) */
function Brows({ kind }: { kind: 'normal' | 'worry' }) {
  const angle = kind === 'normal' ? 6 : -9;
  return (
    <G>
      <Rect x={34} y={41} width={17} height={4.6} rx={2.3} fill={BROW} transform={`rotate(${angle} 42 43)`} />
      <Rect x={69} y={41} width={17} height={4.6} rx={2.3} fill={BROW} transform={`rotate(${-angle} 78 43)`} />
    </G>
  );
}

/** 目3種: open=落ち着いた眼差し / happy=にっこり / closed=閉じ目 */
function Eyes({ kind }: { kind: 'open' | 'happy' | 'closed' }) {
  if (kind === 'open') {
    return (
      <G>
        <Circle cx={45} cy={53} r={3.6} fill={EYE} />
        <Circle cx={46.3} cy={51.8} r={1.1} fill="#fff" />
        <Circle cx={75} cy={53} r={3.6} fill={EYE} />
        <Circle cx={76.3} cy={51.8} r={1.1} fill="#fff" />
      </G>
    );
  }
  if (kind === 'happy') {
    return (
      <G stroke={EYE} strokeWidth={2.4} fill="none" strokeLinecap="round">
        <Path d="M41 54 q4 -5 8 0" />
        <Path d="M71 54 q4 -5 8 0" />
      </G>
    );
  }
  return (
    <G stroke={EYE} strokeWidth={2.2} fill="none" strokeLinecap="round">
      <Path d="M41 53 q4 3.5 8 0" />
      <Path d="M71 53 q4 3.5 8 0" />
    </G>
  );
}

/** 口4種: neutral=結んだ口元 / smile / open=喜び / worry */
function Mouth({ kind }: { kind: 'neutral' | 'smile' | 'open' | 'worry' }) {
  if (kind === 'open') {
    return (
      <G>
        <Path d="M60 68 v2" stroke={LINE} strokeWidth={1.8} strokeLinecap="round" />
        <Ellipse cx={60} cy={76.5} rx={5.5} ry={4.2} fill={LINE} />
      </G>
    );
  }
  const path =
    kind === 'neutral' ? 'M53 74 q7 4 14 0' : kind === 'smile' ? 'M51 73 q9 6.5 18 0' : 'M55 75 q5 -3.5 10 0';
  return (
    <G stroke={LINE} strokeWidth={1.8} fill="none" strokeLinecap="round">
      <Path d="M60 68 v3" />
      <Path d={path} />
    </G>
  );
}

type ArmsKind = 'down' | 'up' | 'point' | 'cheer' | 'crossed' | 'pawsTogether';

/** 腕6種(下ろす・万歳・指し示す・応援・腕組み・両手を合わせる) */
function Arms({ kind }: { kind: ArmsKind }) {
  switch (kind) {
    case 'down':
      return (
        <G stroke={FUR} strokeWidth={10} strokeLinecap="round" fill="none">
          <Path d="M40 102 q-4 8 -3 15" />
          <Path d="M80 102 q4 8 3 15" />
        </G>
      );
    case 'up':
      return (
        <G>
          <G stroke={FUR} strokeWidth={10} strokeLinecap="round" fill="none">
            <Path d="M40 101 q-11 -7 -14 -18" />
            <Path d="M80 101 q11 -7 14 -18" />
          </G>
          <Circle cx={25} cy={81} r={5.6} fill={FUR} />
          <Circle cx={95} cy={81} r={5.6} fill={FUR} />
        </G>
      );
    case 'point':
      return (
        <G>
          <G stroke={FUR} strokeWidth={10} strokeLinecap="round" fill="none">
            <Path d="M40 102 q-4 8 -3 15" />
            <Path d="M78 102 q14 -5 22 -13" />
          </G>
          <Circle cx={102} cy={87} r={5.6} fill={FUR} />
        </G>
      );
    case 'cheer':
      return (
        <G>
          <G stroke={FUR} strokeWidth={10} strokeLinecap="round" fill="none">
            <Path d="M40 102 q-4 8 -3 15" />
            <Path d="M78 103 q10 -1 15 -7" />
          </G>
          <Circle cx={95} cy={94} r={6} fill={FUR} />
        </G>
      );
    case 'crossed':
      return (
        <G stroke={FUR} strokeWidth={10} strokeLinecap="round" fill="none">
          <Path d="M41 105 q19 11 37 -1" />
          <Path d="M79 105 q-19 11 -37 -1" />
        </G>
      );
    case 'pawsTogether':
      return (
        <G>
          <G stroke={FUR} strokeWidth={10} strokeLinecap="round" fill="none">
            <Path d="M41 103 q6 6 13 7" />
            <Path d="M79 103 q-6 6 -13 7" />
          </G>
          <Circle cx={55} cy={111} r={5.6} fill={FUR} />
          <Circle cx={65} cy={111} r={5.6} fill={FUR} />
        </G>
      );
  }
}

/** 小物: おやすみの「zzz」 */
function Zzz() {
  return (
    <G>
      <SvgText x={94} y={40} fontSize={10} fontWeight="700" fill={ZZZ}>
        z
      </SvgText>
      <SvgText x={101} y={31} fontSize={13} fontWeight="700" fill={ZZZ}>
        z
      </SvgText>
      <SvgText x={110} y={21} fontSize={16} fontWeight="700" fill={ZZZ}>
        z
      </SvgText>
    </G>
  );
}

/** 小物: 考え中の泡(静止版) */
function BubblesStatic() {
  return (
    <G fill={BUBBLE}>
      <Circle cx={97} cy={45} r={3} />
      <Circle cx={105} cy={36} r={4.6} />
    </G>
  );
}

/** 小物: 喜びのキラキラ */
function Sparkles() {
  return (
    <G fill={ACCENT}>
      <Path d="M18 66 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8 -4.6 -4.6 -1.8 4.6 -1.8 Z" />
      <Path d="M100 60 l1.5 3.8 3.8 1.5 -3.8 1.5 -1.5 3.8 -1.5 -3.8 -3.8 -1.5 3.8 -1.5 Z" />
    </G>
  );
}

/** 小物: 拍手の動き線 */
function ClapArcs() {
  return (
    <G stroke={ACCENT} strokeWidth={2} fill="none" strokeLinecap="round">
      <Path d="M45 100 q-4 5 -3 10" />
      <Path d="M75 100 q4 5 3 10" />
    </G>
  );
}

// ===== ポーズ = パーツの組み合わせ定義 =====

type PoseDef = {
  arms: ArmsKind;
  brows?: 'normal' | 'worry';
  eyes: 'open' | 'happy' | 'closed';
  mouth: 'neutral' | 'smile' | 'open' | 'worry';
  extra?: 'bubbles' | 'sparkles' | 'zzz' | 'clapArcs';
};

const POSES: Record<HotoriPose, PoseDef> = {
  normal: { arms: 'down', brows: 'normal', eyes: 'open', mouth: 'neutral' },
  guide: { arms: 'point', brows: 'normal', eyes: 'open', mouth: 'smile' },
  thinking: { arms: 'crossed', brows: 'normal', eyes: 'open', mouth: 'neutral', extra: 'bubbles' },
  celebrate: { arms: 'up', brows: 'normal', eyes: 'happy', mouth: 'open', extra: 'sparkles' },
  encourage: { arms: 'cheer', brows: 'normal', eyes: 'open', mouth: 'smile' },
  sleep: { arms: 'down', eyes: 'closed', mouth: 'neutral', extra: 'zzz' },
  concern: { arms: 'pawsTogether', brows: 'worry', eyes: 'open', mouth: 'worry' },
  applaud: { arms: 'pawsTogether', brows: 'normal', eyes: 'happy', mouth: 'smile', extra: 'clapArcs' },
};

const EXTRAS = {
  bubbles: BubblesStatic,
  sparkles: Sparkles,
  zzz: Zzz,
  clapArcs: ClapArcs,
} as const;

const AnimatedG = Animated.createAnimatedComponent(G);

// ===== アニメーションのオーバーレイ部品 =====

/** celebrate: 着水の波紋(足元で広がって消える) */
function CelebrateRipple({ scale }: { scale: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.linear }), -1);
    return () => cancelAnimation(progress);
  }, [progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    // 0〜0.4は待機、0.55で最も濃く、1.0で拡大しきって消える(プロトタイプの hb-rip 相当)
    const grow = p < 0.4 ? 0.35 : 0.35 + ((p - 0.4) / 0.6) * 0.8;
    const opacity = p < 0.4 ? 0 : p < 0.55 ? ((p - 0.4) / 0.15) * 0.8 : 0.8 * (1 - (p - 0.55) / 0.45);
    return { opacity, transform: [{ scale: grow }] };
  });

  const w = 60 * scale;
  const h = 10 * scale;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 30 * scale, top: 136 * scale, width: w, height: h }, style]}>
      <Svg width={w} height={h} viewBox="0 0 60 10">
        <Ellipse cx={30} cy={5} rx={28.5} ry={3.8} stroke={ACCENT} strokeWidth={2} fill="none" />
      </Svg>
    </Animated.View>
  );
}

/** thinking: ふわっと浮かぶ泡(2つを位相ずらしで明滅) */
function ThinkingBubble({
  cx,
  cy,
  r,
  scale,
  initialDelay,
}: {
  cx: number;
  cy: number;
  r: number;
  scale: number;
  initialDelay: number;
}) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    // プロトタイプの hb-bub(2.6s周期: 待機→フェードイン→保持→フェードアウト)相当
    opacity.value = withDelay(
      initialDelay,
      withRepeat(
        withSequence(
          withDelay(390, withTiming(1, { duration: 520 })),
          withDelay(1170, withTiming(0, { duration: 520 })),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [opacity, initialDelay]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const d = 2 * r * scale;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (cx - r) * scale,
          top: (cy - r) * scale,
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: BUBBLE,
        },
        style,
      ]}
    />
  );
}

// ===== 本体 =====

export function Hotori({ pose = 'normal', size = 96, animate, variant = 'full' }: HotoriProps) {
  const reduceMotion = useReduceMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const anim = reduceMotion || variant === 'bust' ? undefined : animate;

  // 呼吸(上下3px)/ 跳ね を担う共有値。viewBox座標ではなく実pxで動かす
  const translateY = useSharedValue(0);
  // 瞬き: 0=開き目, 1=閉じ目
  const blink = useSharedValue(0);

  useEffect(() => {
    if (anim === 'celebrate') {
      // 跳ね(しゃがむ→跳ぶ→着地→ひと呼吸)。プロトタイプの hb-jump 相当
      translateY.value = withRepeat(
        withSequence(
          withTiming(3, { duration: 310, easing: Easing.inOut(Easing.quad) }),
          withTiming(-15, { duration: 410, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 440, easing: Easing.in(Easing.quad) }),
          withDelay(540, withTiming(0, { duration: 1 })),
        ),
        -1,
      );
    } else if (anim === 'idle' || anim === 'thinking') {
      // ゆったりした呼吸
      translateY.value = withRepeat(
        withSequence(
          withTiming(3, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
    } else {
      translateY.value = 0;
    }
    return () => cancelAnimation(translateY);
  }, [anim, translateY]);

  useEffect(() => {
    if (anim === 'idle') {
      // 約4.5秒ごとに瞬き
      blink.value = withRepeat(
        withSequence(
          withDelay(4200, withTiming(1, { duration: 80 })),
          withDelay(140, withTiming(0, { duration: 80 })),
        ),
        -1,
      );
    } else {
      blink.value = 0;
    }
    return () => cancelAnimation(blink);
  }, [anim, blink]);

  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const eyesOpenProps = useAnimatedProps(() => ({ opacity: 1 - blink.value }));
  const eyesClosedProps = useAnimatedProps(() => ({ opacity: blink.value }));

  if (variant === 'bust') {
    // チャットアバター用: 頭部+スカーフのみ、円形・水辺グラデ背景
    const gradId = `hotoriBustGrad${uid}`;
    const clipId = `hotoriBustClip${uid}`;
    return (
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#BFE5F6" />
            <Stop offset="0.7" stopColor="#7CC5E8" />
            <Stop offset="1" stopColor="#2E9FD6" />
          </LinearGradient>
          <ClipPath id={clipId}>
            <Circle cx={60} cy={60} r={60} />
          </ClipPath>
        </Defs>
        <Circle cx={60} cy={60} r={60} fill={`url(#${gradId})`} />
        <G clipPath={`url(#${clipId})`}>
          <Head />
          <Brows kind="normal" />
          <Eyes kind="open" />
          <Mouth kind="neutral" />
          {/* 首と胸元+スカーフ(バストアップ用の切り取り) */}
          <Path d="M42 78 q18 12 36 0 v12 h-36 Z" fill={FUR} />
          <Ellipse cx={60} cy={119} rx={29} ry={28} fill={FUR_BODY} />
          <Path d="M38 88 q22 -10 44 0 l-2.2 8.5 q-20 -8 -39.6 0 Z" fill={SCARF} />
          <Path d="M63 93 l10 3 -3 13 -9 -2.5 Z" fill={SCARF_TAIL} />
        </G>
      </Svg>
    );
  }

  const def = POSES[pose];
  const height = (size * 150) / 120;
  const px = size / 120; // viewBox 1単位あたりの実px
  // アニメーション中は静止版の小物を差し替える(泡→明滅、キラキラ→波紋)
  const hideExtra =
    (anim === 'thinking' && def.extra === 'bubbles') || (anim === 'celebrate' && def.extra === 'sparkles');
  const Extra = def.extra && !hideExtra ? EXTRAS[def.extra] : null;
  const blinking = anim === 'idle' && def.eyes === 'open';

  return (
    <View style={{ width: size, height }} pointerEvents="none">
      {anim === 'celebrate' && <CelebrateRipple scale={px} />}
      <Animated.View style={bobStyle}>
        <Svg width={size} height={height} viewBox="0 0 120 150">
          <Head />
          <Body />
          <Arms kind={def.arms} />
          {def.brows && <Brows kind={def.brows} />}
          {blinking ? (
            <>
              <AnimatedG animatedProps={eyesOpenProps}>
                <Eyes kind="open" />
              </AnimatedG>
              <AnimatedG animatedProps={eyesClosedProps}>
                <Eyes kind="closed" />
              </AnimatedG>
            </>
          ) : (
            <Eyes kind={def.eyes} />
          )}
          <Mouth kind={def.mouth} />
          {Extra && <Extra />}
        </Svg>
      </Animated.View>
      {anim === 'thinking' && (
        <>
          <ThinkingBubble cx={97} cy={45} r={3} scale={px} initialDelay={0} />
          <ThinkingBubble cx={105} cy={36} r={4.6} scale={px} initialDelay={500} />
        </>
      )}
    </View>
  );
}
