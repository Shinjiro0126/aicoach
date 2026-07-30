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
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useReduceMotion } from '@/hooks/use-reduce-motion';

/**
 * コーチキャラクター「ホトリ」(コーチ姿のカワウソ)。
 * ネイビーのパーカー・丸メガネ・首から下げたホイッスルが目印。
 * SVGパーツ(頭・パーカー・目・眉・口・腕・小物)の組み合わせでポーズを構成する。
 * パスデータとカラーは確定デザインSVG(design-pose-*.svg / design-final-bust.svg)が原本。
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
  | 'applaud' // 拍手: 目標達成、ストリーク節目
  | 'hero'; // ヒーロー: ペイウォール等の主役ポーズ(ウィンク+指差し+観察ボード)

export type HotoriAnimation = 'idle' | 'celebrate' | 'thinking';

export type HotoriProps = {
  pose?: HotoriPose;
  /** 表示幅(px)。full は高さが size × 150/120 になる */
  size?: number;
  /** idle=瞬き+呼吸 / celebrate=跳ね+波紋(達成の瞬間に1回再生) / thinking=泡。reduce motion 時は無効 */
  animate?: HotoriAnimation;
  /** full=全身 / bust=チャットアバター用の頭部+胸元(円形・水辺グラデ背景つき) */
  variant?: 'full' | 'bust';
};

// ===== カラーパレット(キャラクター固有色。テーマに依らず固定) =====
const LINE = '#41302A'; // 鼻下・口
const EYE = '#241A14'; // 瞳・にっこり弧
const BROW = '#66503B'; // 眉
const WHISKER = '#E3D4B8'; // ひげ(明色)
const TEAR_HI = '#AEDFF6'; // 涙袋の照り返し
const SLEEVE = '#17638F'; // パーカーの袖
const SLEEVE_HI = '#2E86B4'; // 袖のハイライト
const CUFF = '#125273'; // 袖口リブ・ポケット
const LANYARD = '#5FC2EE'; // ホイッスルの紐・水辺の照り返し
const METAL_EDGE = '#8FA0AC'; // ホイッスルの縁取り
const BUBBLE = '#9DC3D9'; // 考え中の泡
const ZZZ = '#5B87A3'; // おやすみの zzz
// 原本SVGのテキストは 'Helvetica Neue' 指定(zzz・COACHロゴ共通)
const TEXT_FONT = 'Helvetica Neue';
const ACCENT = '#2E9FD6'; // 波紋・動き線・指先アクセント
const GOLD = '#F2C14E'; // 喜びのキラキラ(金)

// ===== グラデーション定義 =====
// 同一画面に複数インスタンスが並ぶため、id は useId で必ず名前空間化する

/** uid からグラデーション参照(url)の対応表を作る */
function gradientUrls(uid: string) {
  const u = (name: string) => `url(#hotori${name}${uid})`;
  return {
    furHead: u('FurHead'), // 頭・手の毛
    furBody: u('FurBody'), // 首元の毛
    furInner: u('FurInner'), // 耳の内側・足・しっぽ
    cream: u('Cream'), // マズルの明るい毛
    shadeFur: u('ShadeFur'), // 頭の外周の落ち影
    shadeCream: u('ShadeCream'), // マズルの外周の落ち影
    shadeBlue: u('ShadeBlue'), // パーカーの外周の落ち影
    hoodieBody: u('HoodieBody'), // パーカー本体
    hoodOuter: u('HoodOuter'), // フードの外側
    metal: u('Metal'), // ホイッスルの金属
    boardG: u('BoardG'), // 観察ボードの板(hero)
    paperG: u('PaperG'), // 観察ボードの紙(hero)
    eyeG: u('EyeG'), // 瞳
    blush: u('Blush'), // 頬の赤み
    noseG: u('NoseG'), // 鼻
    // バスト専用
    bustBg: u('BustBg'), // 円形の水辺グラデ背景
    neckG: u('NeckG'), // あご下の毛(明るめ)
    vig: u('Vig'), // 円形の縁の落ち影
    bustClip: `hotoriBustClip${uid}`, // ClipPath は id そのものを使う
  };
}
type Grad = ReturnType<typeof gradientUrls>;

/** キャラクター共通のグラデーション定義(bust では専用グラデを追加) */
function CharacterDefs({ uid, variant }: { uid: string; variant: 'full' | 'bust' }) {
  const id = (name: string) => `hotori${name}${uid}`;
  return (
    <Defs>
      <RadialGradient id={id('FurHead')} cx="0.36" cy="0.28" r="0.95">
        <Stop offset="0" stopColor="#A8896B" />
        <Stop offset="0.52" stopColor="#8B6B54" />
        <Stop offset="1" stopColor="#755841" />
      </RadialGradient>
      <RadialGradient id={id('FurBody')} cx="0.36" cy="0.28" r="0.95">
        <Stop offset="0" stopColor="#97785F" />
        <Stop offset="0.55" stopColor="#7A5C47" />
        <Stop offset="1" stopColor="#5F4732" />
      </RadialGradient>
      <RadialGradient id={id('FurInner')} cx="0.4" cy="0.3" r="0.9">
        <Stop offset="0" stopColor="#7E604A" />
        <Stop offset="0.55" stopColor="#6E523E" />
        <Stop offset="1" stopColor="#56402D" />
      </RadialGradient>
      <RadialGradient id={id('Cream')} cx="0.4" cy="0.3" r="0.95">
        <Stop offset="0" stopColor="#FCF6EC" />
        <Stop offset="0.55" stopColor="#F0E4D2" />
        <Stop offset="1" stopColor="#DFCCAC" />
      </RadialGradient>
      <RadialGradient id={id('ShadeFur')} cx="0.36" cy="0.3" r="0.95">
        <Stop offset="0" stopColor="#3E2B1C" stopOpacity="0" />
        <Stop offset="0.72" stopColor="#3E2B1C" stopOpacity="0" />
        <Stop offset="1" stopColor="#3E2B1C" stopOpacity="0.3" />
      </RadialGradient>
      <RadialGradient id={id('ShadeCream')} cx="0.38" cy="0.3" r="0.95">
        <Stop offset="0" stopColor="#B08F63" stopOpacity="0" />
        <Stop offset="0.7" stopColor="#B08F63" stopOpacity="0" />
        <Stop offset="1" stopColor="#B08F63" stopOpacity="0.32" />
      </RadialGradient>
      <RadialGradient id={id('ShadeBlue')} cx="0.36" cy="0.28" r="0.95">
        <Stop offset="0" stopColor="#04263C" stopOpacity="0" />
        <Stop offset="0.7" stopColor="#04263C" stopOpacity="0" />
        <Stop offset="1" stopColor="#04263C" stopOpacity="0.48" />
      </RadialGradient>
      <RadialGradient id={id('HoodieBody')} cx="0.35" cy={variant === 'bust' ? '0.24' : '0.26'} r="1">
        <Stop offset="0" stopColor="#2E86B4" />
        <Stop offset="0.55" stopColor="#17638F" />
        <Stop offset="1" stopColor="#0E4767" />
      </RadialGradient>
      <LinearGradient id={id('HoodOuter')} x1="0" y1="0" x2="0.55" y2="1">
        <Stop offset="0" stopColor="#2E86B4" />
        <Stop offset="0.55" stopColor="#17638F" />
        <Stop offset="1" stopColor="#114E72" />
      </LinearGradient>
      <LinearGradient id={id('Metal')} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#EEF4F8" />
        <Stop offset="0.55" stopColor="#C4D0D9" />
        <Stop offset="1" stopColor="#9DAEBA" />
      </LinearGradient>
      <LinearGradient id={id('BoardG')} x1="0" y1="0" x2="0.4" y2="1">
        <Stop offset="0" stopColor="#9A7850" />
        <Stop offset="0.5" stopColor="#8A6B47" />
        <Stop offset="1" stopColor="#6F553A" />
      </LinearGradient>
      <LinearGradient id={id('PaperG')} x1="0" y1="0" x2="0.2" y2="1">
        <Stop offset="0" stopColor="#FAF2E3" />
        <Stop offset="1" stopColor="#EDDFC6" />
      </LinearGradient>
      <RadialGradient id={id('EyeG')} cx="0.36" cy="0.3" r="0.9">
        <Stop offset="0" stopColor="#4A3524" />
        <Stop offset="0.55" stopColor="#241A14" />
        <Stop offset="1" stopColor="#0F0A06" />
      </RadialGradient>
      <RadialGradient id={id('Blush')} cx="0.5" cy="0.5" r="0.5">
        <Stop offset="0" stopColor="#D69B77" stopOpacity="0.5" />
        <Stop offset="1" stopColor="#D69B77" stopOpacity="0" />
      </RadialGradient>
      <LinearGradient id={id('NoseG')} x1="0" y1="0" x2="0.2" y2="1">
        <Stop offset="0" stopColor="#5A423A" />
        <Stop offset="1" stopColor="#31231D" />
      </LinearGradient>
      {variant === 'bust' && (
        <>
          <LinearGradient id={id('BustBg')} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#BFE5F6" />
            <Stop offset="0.7" stopColor="#7CC5E8" />
            <Stop offset="1" stopColor="#2E9FD6" />
          </LinearGradient>
          {/* あご下の毛: 明度を上げ、上端を顔の毛色に寄せて境界をなじませる */}
          <LinearGradient id={id('NeckG')} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#9B7C60" />
            <Stop offset="0.45" stopColor="#8A6B51" />
            <Stop offset="1" stopColor="#6E563F" />
          </LinearGradient>
          <RadialGradient id={id('Vig')} cx="0.5" cy="0.46" r="0.5">
            <Stop offset="0" stopColor="#0B3B58" stopOpacity="0" />
            <Stop offset="0.82" stopColor="#0B3B58" stopOpacity="0" />
            <Stop offset="1" stopColor="#0B3B58" stopOpacity="0.3" />
          </RadialGradient>
          <ClipPath id={id('BustClip')}>
            <Circle cx={60} cy={60} r={60} />
          </ClipPath>
        </>
      )}
    </Defs>
  );
}

// ===== パーツ =====

/** しっぽ(体の右後ろから覗く) */
function Tail({ g }: { g: Grad }) {
  return (
    <G>
      <Path d="M78 122 Q97 118 106 130 Q110 136 103 139 Q90 142.5 79 135 Z" fill={g.furInner} />
      <Path d="M82 124.5 Q96 121.5 103 130" fill="none" stroke="#8B6B54" strokeWidth={2.6} strokeLinecap="round" opacity={0.55} />
      <Path d="M86 138.6 Q96 141.6 103.5 136.8" fill="none" stroke={LANYARD} strokeWidth={1.8} strokeLinecap="round" opacity={0.22} />
    </G>
  );
}

/** 下ろしたフード(背面: 背中側に垂らした状態。両肩に畳まれた丸い襞が覗く) */
function HoodBack({ g }: { g: Grad }) {
  return (
    <G>
      <Path d="M34 77 Q25 82 26 90.5 Q27.5 97 36 99 L84 99 Q92.5 97 94 90.5 Q95 82 86 77 Q73 70.5 60 70.5 Q47 70.5 34 77 Z" fill={g.hoodOuter} />
      <Path d="M36.5 80.5 Q32.5 87.5 35 95.5" fill="none" stroke="#0C4260" strokeWidth={1.5} strokeLinecap="round" opacity={0.65} />
      <Path d="M29.5 85 Q28 90 31 95.5" fill="none" stroke="#0C4260" strokeWidth={1.3} strokeLinecap="round" opacity={0.5} />
      <Path d="M83.5 80.5 Q87.5 87.5 85 95.5" fill="none" stroke="#0A3A56" strokeWidth={1.5} strokeLinecap="round" opacity={0.7} />
      <Path d="M90.5 85 Q92 90 89 95.5" fill="none" stroke="#0A3A56" strokeWidth={1.3} strokeLinecap="round" opacity={0.55} />
      <Path d="M91.5 82.5 Q94.5 87.5 92 93 Q90 96.5 85.5 98" fill="none" stroke="#072C42" strokeWidth={2.4} strokeLinecap="round" opacity={0.4} />
      <Path d="M30 79.5 Q26 83.5 26.3 90" fill="none" stroke="#A9DBF3" strokeWidth={2.4} strokeLinecap="round" opacity={0.2} />
      <Path d="M30 79.5 Q26 83.5 26.3 90" fill="none" stroke="#CDE9F8" strokeWidth={1.1} strokeLinecap="round" opacity={0.32} />
    </G>
  );
}

/** 頭の土台(あほ毛・耳・輪郭・マズル・頬・鼻)。variant で細部の明度を切り替える */
function HeadBase({ g, variant }: { g: Grad; variant: 'full' | 'bust' }) {
  const bust = variant === 'bust';
  return (
    <G>
      {/* あほ毛 */}
      <Path d="M50 26 C51 22.4 54 21.9 55.4 24.4 C56.6 21.5 59.8 21.3 61.2 24.1 C62.4 21.7 65.4 22.1 66 25.3 C60.8 24 55.4 24 50 26 Z" fill="#9B7C60" opacity={0.95} />
      {/* 頬横の毛のはね */}
      <Path d="M25.8 58 l-5 2.4 4.4 2 -3.6 2.8 4.9 1.5 Z" fill="#83654E" />
      <Path d="M94.2 58 l5 2.4 -4.4 2 3.6 2.8 -4.9 1.5 Z" fill={bust ? '#7A5C45' : '#6B5039'} />
      {/* 耳 */}
      <Circle cx={30} cy={34} r={9} fill={g.furHead} />
      <Circle cx={30.8} cy={35} r={4.4} fill={g.furInner} />
      <Circle cx={27.2} cy={31.2} r={2.1} fill="#B99A78" opacity={bust ? 0.35 : 0.55} />
      <Circle cx={90} cy={34} r={9} fill={g.furHead} />
      <Circle cx={90.8} cy={35} r={4.4} fill={g.furInner} />
      <Circle cx={87.2} cy={31.2} r={2.1} fill="#B99A78" opacity={0.4} />
      {/* 顔の輪郭+外周の落ち影 */}
      <Ellipse cx={60} cy={56} rx={36} ry={32} fill={g.furHead} />
      <Ellipse cx={60} cy={56} rx={36} ry={32} fill={g.shadeFur} />
      {/* 左輪郭のリムライト(水辺の照り返し) */}
      <Path d="M29.5 73 Q23 57 28 42.5" fill="none" stroke="#EAF6FD" strokeWidth={4} strokeLinecap="round" opacity={bust ? 0.1 : 0.16} />
      <Path d="M29.5 72 Q23.6 57 28.2 43.5" fill="none" stroke="#EAF6FD" strokeWidth={1.8} strokeLinecap="round" opacity={bust ? 0.18 : 0.28} />
      {/* マズル+落ち影 */}
      <Ellipse cx={60} cy={68} rx={23} ry={17} fill={g.cream} />
      <Ellipse cx={60} cy={68} rx={23} ry={17} fill={g.shadeCream} />
      {/* 頬の赤み */}
      <Circle cx={39} cy={65} r={6.5} fill={g.blush} />
      <Circle cx={81} cy={65} r={6.5} fill={g.blush} />
      {/* あご下の淡い影 */}
      <Ellipse cx={60} cy={69.6} rx={5.5} ry={2.6} fill="#C9AE85" opacity={0.3} />
      {/* 鼻+ハイライト */}
      <Path d="M55 61 h10 q1.6 0 1 1.5 l-4.4 5 q-1.6 1.8 -3.2 0 l-4.4 -5 q-0.6 -1.5 1 -1.5 Z" fill={g.noseG} />
      <Ellipse cx={57.6} cy={62.5} rx={1.5} ry={0.85} fill="#FFFFFF" opacity={0.45} transform="rotate(-16 57.6 62.5)" />
    </G>
  );
}

/** 頭の前面(丸メガネ+ひげ)。目・眉の上に重ねる */
function HeadFront({ variant }: { variant: 'full' | 'bust' }) {
  const bust = variant === 'bust';
  return (
    <G>
      {/* 丸メガネ(細ワイヤー。bust はリムをわずかに細くして目とのコントラスト確保) */}
      <G fill="none" stroke="#4A382A" strokeWidth={bust ? 1.4 : 1.5} strokeLinecap="round">
        <Circle cx={45} cy={53.5} r={8.4} fill="#EAF7FF" fillOpacity={0.13} />
        <Circle cx={75} cy={53.5} r={8.4} fill="#EAF7FF" fillOpacity={0.13} />
        <Path d="M53.2 52.2 q6.8 -4.2 13.6 0" />
        <Path d="M36.8 51.5 L26.5 47.8" />
        <Path d="M83.2 51.5 L93.5 47.8" />
      </G>
      <Path d="M39.4 48.4 a8.4 8.4 0 0 1 4.2 -2.9" fill="none" stroke="#FFFFFF" strokeWidth={0.9} strokeLinecap="round" opacity={0.38} />
      <Path d="M69.4 48.4 a8.4 8.4 0 0 1 4.2 -2.9" fill="none" stroke="#FFFFFF" strokeWidth={0.9} strokeLinecap="round" opacity={0.38} />
      {/* ひげ(明色+わずかな垂れカーブ。小サイズでも残す) */}
      <G stroke={WHISKER} strokeWidth={bust ? 1.4 : 1.3} strokeLinecap="round" opacity={0.9} fill="none">
        <Path d="M35 62 q-9 -1.5 -16.5 -4" />
        <Path d="M35 66.5 q-9.5 0 -17 1" />
        <Path d="M35 70.5 q-8.5 2 -15 4.6" />
        <Path d="M85 62 q9 -1.5 16.5 -4" />
        <Path d="M85 66.5 q9.5 0 17 1" />
        <Path d="M85 70.5 q8.5 2 15 4.6" />
      </G>
    </G>
  );
}

/** 眉2種(normal=たれ気味のやさしい眉 / worry=ハの字の困り眉) */
function Brows({ kind }: { kind: 'normal' | 'worry' }) {
  if (kind === 'worry') {
    return (
      <G stroke={BROW} strokeWidth={2.2} fill="none" strokeLinecap="round">
        <Path d="M38.8 46.2 Q43.5 45 49.3 42.4" />
        <Path d="M81.2 46.2 Q76.5 45 70.7 42.4" />
      </G>
    );
  }
  return (
    <G stroke={BROW} strokeWidth={2.2} fill="none" strokeLinecap="round">
      <Path d="M38.5 44 Q43.5 41.6 49.5 42.6" />
      <Path d="M81.5 44 Q76.5 41.6 70.5 42.6" />
    </G>
  );
}

/** 目(happy=にっこり弧 / closed=閉じ目)。開き目は瞳グラデが必要なため OpenEyes を使う */
function Eyes({ kind }: { kind: 'happy' | 'closed' }) {
  if (kind === 'happy') {
    return (
      <G>
        <Path d="M40.6 54.4 q4.4 -5.2 8.8 0" stroke={EYE} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        <Path d="M70.6 54.4 q4.4 -5.2 8.8 0" stroke={EYE} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        <Path d="M42.2 58.6 q2.6 1.9 5.2 0.1" fill="none" stroke={TEAR_HI} strokeWidth={1} strokeLinecap="round" opacity={0.55} />
        <Path d="M72.2 58.6 q2.6 1.9 5.2 0.1" fill="none" stroke={TEAR_HI} strokeWidth={1} strokeLinecap="round" opacity={0.55} />
      </G>
    );
  }
  return (
    <G>
      <Path d="M40.6 52.8 q4.4 4 8.8 0" stroke={EYE} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M70.6 52.8 q4.4 4 8.8 0" stroke={EYE} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M42.2 58.9 q2.6 1.7 5.2 0.1" fill="none" stroke={TEAR_HI} strokeWidth={1} strokeLinecap="round" opacity={0.45} />
      <Path d="M72.2 58.9 q2.6 1.7 5.2 0.1" fill="none" stroke={TEAR_HI} strokeWidth={1} strokeLinecap="round" opacity={0.45} />
    </G>
  );
}

/** 開き目の瞳グラデはインスタンスの uid に依存するため、fill を差し込むラッパー */
function OpenEyes({ g }: { g: Grad }) {
  return (
    <G>
      <Circle cx={45} cy={53.3} r={4.6} fill={g.eyeG} />
      <Circle cx={43.5} cy={51.4} r={2} fill="#FFFFFF" />
      <Circle cx={46.9} cy={55.3} r={0.95} fill="#FFFFFF" opacity={0.6} />
      <Circle cx={43.1} cy={55.9} r={0.6} fill="#7CC5E8" opacity={0.8} />
      <Circle cx={75} cy={53.3} r={4.6} fill={g.eyeG} />
      <Circle cx={73.5} cy={51.4} r={2} fill="#FFFFFF" />
      <Circle cx={76.9} cy={55.3} r={0.95} fill="#FFFFFF" opacity={0.6} />
      <Circle cx={73.1} cy={55.9} r={0.6} fill="#7CC5E8" opacity={0.8} />
      <Path d="M42.7 58.6 q2.3 1.8 4.6 0.1" fill="none" stroke={TEAR_HI} strokeWidth={1} strokeLinecap="round" opacity={0.5} />
      <Path d="M72.7 58.6 q2.3 1.8 4.6 0.1" fill="none" stroke={TEAR_HI} strokeWidth={1} strokeLinecap="round" opacity={0.5} />
    </G>
  );
}

/** ウィンク目(hero): 左=開き目(瞳グラデ)/ 右=やわらかいウィンク弧。原本 design-final-hero.svg 準拠 */
function WinkEyes({ g }: { g: Grad }) {
  return (
    <G>
      <Circle cx={45} cy={53.3} r={4.6} fill={g.eyeG} />
      <Circle cx={43.5} cy={51.4} r={2} fill="#FFFFFF" />
      <Circle cx={46.9} cy={55.3} r={0.95} fill="#FFFFFF" opacity={0.6} />
      <Circle cx={43.1} cy={55.9} r={0.6} fill="#7CC5E8" opacity={0.8} />
      <Path d="M42.7 58.6 q2.3 1.8 4.6 0.1" fill="none" stroke={TEAR_HI} strokeWidth={1} strokeLinecap="round" opacity={0.5} />
      <Path d="M70.6 54.2 q4.4 -5 8.8 0" stroke={EYE} strokeWidth={2.6} fill="none" strokeLinecap="round" />
    </G>
  );
}

/** 口4種: neutral=穏やかな微笑み / smile=にっこり / open=喜び(舌つき) / worry=への字ぎみの小さな口 */
function Mouth({ kind, variant = 'full' }: { kind: 'neutral' | 'smile' | 'open' | 'worry'; variant?: 'full' | 'bust' }) {
  if (kind === 'open') {
    return (
      <G>
        <Path d="M60 67.6 v2.6" stroke={LINE} strokeWidth={1.7} fill="none" strokeLinecap="round" />
        <Path d="M52.5 72.5 Q60 79 67.5 72.5 Q66 81.5 60 81.5 Q54 81.5 52.5 72.5 Z" fill="#4E332B" />
        <Ellipse cx={60} cy={79.4} rx={3.6} ry={2.1} fill="#D98A7E" />
      </G>
    );
  }
  if (variant === 'bust') {
    // バストの微笑みは原本どおりわずかに下げる
    return (
      <G stroke={LINE} fill="none" strokeLinecap="round">
        <Path d="M60 68 v3" strokeWidth={1.8} />
        <Path d="M52.5 73.2 q7.5 5.4 15 0" strokeWidth={2} />
      </G>
    );
  }
  const path =
    kind === 'neutral'
      ? { d: 'M52.5 73 q7.5 5.4 15 0', w: 2 }
      : kind === 'smile'
        ? { d: 'M51.5 72.5 q8.5 6.3 17 0', w: 2.1 }
        : { d: 'M56 75 q4 -2.8 8 0', w: 2 };
  return (
    <G stroke={LINE} fill="none" strokeLinecap="round">
      <Path d="M60 67.6 v3" strokeWidth={1.7} />
      <Path d={path.d} strokeWidth={path.w} />
    </G>
  );
}

/** 首元の毛(全身用) */
function NeckFur({ g }: { g: Grad }) {
  return (
    <G>
      <Path d="M42 78 q18 12 36 0 v14 h-36 Z" fill={g.furBody} />
      <Path d="M41 82 Q60 91 79 82" fill="none" stroke={LANYARD} strokeWidth={2.2} strokeLinecap="round" opacity={0.18} />
    </G>
  );
}

/** パーカー本体(洋梨型: 肩は狭く、裾に向かってふくらむ)+カンガルーポケット */
function HoodieBody({ g }: { g: Grad }) {
  const body =
    'M60 88.5 C51 88.5 45 91 43.5 96.5 C39 107 33.5 114 33 123 C32.4 132.6 44 137.8 60 137.8 C76 137.8 87.6 132.6 87 123 C86.5 114 81 107 76.5 96.5 C75 91 69 88.5 60 88.5 Z';
  return (
    <G>
      <Path d={body} fill={g.hoodieBody} />
      <Path d={body} fill={g.shadeBlue} />
      <Path d="M35.5 120 Q33 109 41 98.5" fill="none" stroke="#9ED4F0" strokeWidth={2} strokeLinecap="round" opacity={0.45} />
    </G>
  );
}

/** 首元: 畳まれたフードのロール(前面)。バストは全身より2下+原本準拠の微調整(下端102.5・裾線104.4) */
function HoodRoll({ g, variant = 'full' }: { g: Grad; variant?: 'full' | 'bust' }) {
  const bust = variant === 'bust';
  const roll = bust
    ? 'M42.5 91 Q51 98.5 60 98.5 Q69 98.5 77.5 91 Q82 93.5 81 98 Q70.5 103.5 60 102.5 Q49.5 103.5 39 98 Q38 93.5 42.5 91 Z'
    : 'M42.5 89 Q51 96.5 60 96.5 Q69 96.5 77.5 89 Q82 91.5 81 96 Q70.5 101.5 60 101 Q49.5 101.5 39 96 Q38 91.5 42.5 89 Z';
  const hem = bust ? 'M42 98.6 Q60 104.4 78 98.6' : 'M42 96.6 Q60 102.6 78 96.6';
  return (
    <G>
      <Path d={roll} fill={g.hoodOuter} />
      {/* 折りジワとハイライトはバスト原本でも全身のちょうど+2 */}
      <G y={bust ? 2 : 0}>
        <Path d="M50.5 92.3 Q52 96 51.5 99.3" fill="none" stroke="#0C4260" strokeWidth={1.3} strokeLinecap="round" opacity={0.6} />
        <Path d="M69.5 92.3 Q68 96 68.5 99.3" fill="none" stroke="#0A3A56" strokeWidth={1.3} strokeLinecap="round" opacity={0.6} />
        <Path d="M45 90.8 Q52.5 96.2 60 96.2" fill="none" stroke="#9ED4F0" strokeWidth={1.1} strokeLinecap="round" opacity={0.5} />
      </G>
      <Path d={hem} fill="none" stroke="#0A3A56" strokeWidth={1} strokeLinecap="round" opacity={0.45} />
    </G>
  );
}

/** カンガルーポケット+布の落ちジワ */
function Pocket() {
  return (
    <G>
      <Path d="M48.5 124 Q60 128.5 71.5 124 L69 134.5 Q60 138.5 51 134.5 Z" fill={CUFF} />
      <Path d="M48.5 124 L51 134.5" stroke="#0F4B70" strokeWidth={1.2} fill="none" strokeLinecap="round" />
      <Path d="M71.5 124 L69 134.5" stroke="#0F4B70" strokeWidth={1.2} fill="none" strokeLinecap="round" />
      <Path d="M49.5 124.3 Q60 128.4 70.5 124.3" stroke={SLEEVE_HI} strokeWidth={1} fill="none" strokeLinecap="round" opacity={0.5} />
      <Path d="M44 118 q3.5 4.5 9 5.8" stroke="#0E4767" strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.45} />
      <Path d="M77 115 q-2 4 -5.5 5.6" stroke="#0E4767" strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.45} />
    </G>
  );
}

/** 胸: COACH ロゴ+ホイッスルの紐(腕が胸を覆うポーズではロゴを描かない) */
function ChestGear({ showCoach, lanyardEnd = 115 }: { showCoach: boolean; lanyardEnd?: number }) {
  return (
    <G>
      {showCoach && (
        <SvgText x={60} y={105.5} fontFamily={TEXT_FONT} fontSize={6.6} fontWeight="800" fill="#E3F4FC" textAnchor="middle" letterSpacing={0.7}>
          COACH
        </SvgText>
      )}
      <Path d={`M45.5 98.5 L57 ${lanyardEnd}`} stroke={LANYARD} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Path d={`M74.5 98.5 L63 ${lanyardEnd}`} stroke={LANYARD} strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </G>
  );
}

/** ホイッスル(金属)。dy で腕ポーズに合わせて下げる(原本SVG準拠) */
function Whistle({ g, dy = 0 }: { g: Grad; dy?: number }) {
  return (
    <G y={dy}>
      <Rect x={53} y={112.5} width={11} height={7.5} rx={3.2} fill={g.metal} stroke={METAL_EDGE} strokeWidth={0.5} />
      <Rect x={53.6} y={113.1} width={9.8} height={2.8} rx={1.4} fill="#EDF3F7" opacity={0.85} />
      <Circle cx={63.5} cy={119.2} r={4.1} fill={g.metal} stroke={METAL_EDGE} strokeWidth={0.5} />
      <Circle cx={63.5} cy={119.2} r={1.5} fill="#6E7E8A" />
    </G>
  );
}

/** 体の下面の水辺照り返し+足 */
function Feet({ g }: { g: Grad }) {
  return (
    <G>
      <Path d="M38 129.5 Q60 139.8 82 129.5" fill="none" stroke={LANYARD} strokeWidth={2.6} strokeLinecap="round" opacity={0.22} />
      <Ellipse cx={46} cy={139} rx={8} ry={4.5} fill={g.furInner} />
      <Ellipse cx={74} cy={139} rx={8} ry={4.5} fill={g.furInner} />
      <G stroke="#4F3826" strokeWidth={1} strokeLinecap="round" opacity={0.5}>
        <Path d="M43.4 137.4 v3.2" />
        <Path d="M46.8 137.8 v3.4" />
        <Path d="M71.4 137.4 v3.2" />
        <Path d="M74.8 137.8 v3.4" />
      </G>
      <Path d="M40.5 141.6 Q46 143.5 51.5 141.6" fill="none" stroke={LANYARD} strokeWidth={1.4} strokeLinecap="round" opacity={0.2} />
      <Path d="M68.5 141.6 Q74 143.5 79.5 141.6" fill="none" stroke={LANYARD} strokeWidth={1.4} strokeLinecap="round" opacity={0.2} />
    </G>
  );
}

type ArmsKind = 'down' | 'up' | 'point' | 'cheer' | 'crossed' | 'pawsTogether' | 'heroBoard';

/** 左腕: 自然に下ろす(袖+ハイライト+袖口リブ+手) */
function ArmLeftDown({ g }: { g: Grad }) {
  return (
    <G>
      <Path d="M41 100.5 q-8.5 4.5 -7.5 16" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
      <Path d="M39.5 99.6 q-7.5 4.2 -7 14" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
      <Circle cx={33.6} cy={118.5} r={5.2} fill={CUFF} />
      <Circle cx={33.8} cy={120.8} r={4.6} fill={g.furHead} />
    </G>
  );
}

/** 右腕: 自然に下ろす */
function ArmRightDown({ g }: { g: Grad }) {
  return (
    <G>
      <Path d="M79 100.5 q8.5 4.5 7.5 16" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
      <Path d="M79.5 99.4 q7.5 4.2 7.2 13.6" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
      <Circle cx={86.4} cy={118.5} r={5.2} fill={CUFF} />
      <Circle cx={86.2} cy={120.8} r={4.6} fill={g.furHead} />
    </G>
  );
}

/** 右腕: 空へ指し示す(指先アクセントつき)。guide / hero で共用 */
function ArmRightPoint({ g }: { g: Grad }) {
  return (
    <G>
      <Path d="M78 102 q14 -5 22 -13" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
      <Path d="M78 100.4 q13.5 -4.8 21 -12.2" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
      <Circle cx={100} cy={89} r={5.6} fill={CUFF} />
      <Circle cx={102.4} cy={86.6} r={5} fill={g.furHead} />
      <Circle cx={106.4} cy={83} r={2.5} fill={g.furHead} />
      <G stroke={ACCENT} strokeWidth={2} strokeLinecap="round">
        <Line x1={106} y1={74} x2={109} y2={67.5} />
        <Line x1={112} y1={80} x2={117.5} y2={75.5} />
      </G>
    </G>
  );
}

/** 左腕+観察ボード(hero)。原本の描画順を厳守: 袖→ボード→拳(拳はボード右縁に半重なり) */
function ArmLeftBoard({ g }: { g: Grad }) {
  return (
    <G>
      {/* 袖(腕)は常にボードの背面 */}
      <Path d="M40 103 q-8 2 -11 7" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
      <Path d="M40 101.6 q-7.5 1.8 -10.4 6.2" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
      {/* 観察ボード(左手で前に構える。右縁を親指前掛けサイドグリップ) */}
      <G rotation={-12} origin="30, 100">
        <Rect x={16.5} y={84} width={22} height={29} rx={3} fill={g.boardG} />
        <Rect x={19} y={89} width={17} height={21.5} rx={1.8} fill={g.paperG} stroke="#C9B48D" strokeWidth={0.5} />
        <Line x1={21.5} y1={95} x2={31.5} y2={95} stroke={ACCENT} strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={21.5} y1={100} x2={31.5} y2={100} stroke={BUBBLE} strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={21.5} y1={105} x2={28} y2={105} stroke={BUBBLE} strokeWidth={1.5} strokeLinecap="round" />
        <Rect x={23.5} y={81} width={8} height={5.5} rx={1.6} fill={g.metal} stroke={METAL_EDGE} strokeWidth={0.5} />
        {/* 拳: ボード右縁の中央を握る(縁に半分重ねる) */}
        <Ellipse cx={34.8} cy={101.8} rx={1.7} ry={2.7} fill="#B08F63" opacity={0.25} />
        <Circle cx={39} cy={100} r={5.3} fill={CUFF} />
        <Ellipse cx={38.7} cy={100} rx={4.9} ry={4.6} fill={g.furHead} />
        {/* 親指: 独立カプセルで縁の前に掛かる(紙面に約2px食い込む) */}
        <Rect x={33.9} y={95} width={2.7} height={6.2} rx={1.35} fill={g.furHead} rotation={6} origin="35.2, 98" />
      </G>
    </G>
  );
}

/** 腕7種(下ろす・万歳・指し示す・応援・腕組み・両手を合わせる・ボード持ち指差し) */
function Arms({ kind, g }: { kind: ArmsKind; g: Grad }) {
  switch (kind) {
    case 'down':
      return (
        <G>
          <ArmLeftDown g={g} />
          <ArmRightDown g={g} />
        </G>
      );
    case 'up':
      // 万歳(両腕を斜め上へ)
      return (
        <G>
          <Path d="M40 101 q-11 -7 -14 -18" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
          <Path d="M38.8 100 q-10 -6.4 -12.7 -16.3" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
          <Circle cx={26.4} cy={84} r={5.2} fill={CUFF} />
          <Circle cx={25} cy={81} r={5} fill={g.furHead} />
          <Path d="M80 101 q11 -7 14 -18" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
          <Path d="M81.2 100 q10 -6.4 12.7 -16.3" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
          <Circle cx={93.6} cy={84} r={5.2} fill={CUFF} />
          <Circle cx={95} cy={81} r={5} fill={g.furHead} />
        </G>
      );
    case 'point':
      // 左は下ろし、右は空へ指し示す(指先アクセントつき)
      return (
        <G>
          <ArmLeftDown g={g} />
          <ArmRightPoint g={g} />
        </G>
      );
    case 'heroBoard':
      // 左は観察ボードを構え、右は空へ指し示す(hero)
      return (
        <G>
          <ArmLeftBoard g={g} />
          <ArmRightPoint g={g} />
        </G>
      );
    case 'cheer':
      // 左は下ろし、右は拳を掲げて応援
      return (
        <G>
          <ArmLeftDown g={g} />
          <Path d="M78 103 q10 -1 15 -7" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
          <Path d="M78 101.5 q9.5 -0.9 14.2 -6.5" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
          <Circle cx={93.4} cy={95.4} r={5.2} fill={CUFF} />
          <Circle cx={95.8} cy={92.4} r={5} fill={g.furHead} />
        </G>
      );
    case 'crossed':
      // 胸の前で腕組み(拳は袖の下にたくし込む=袖のみ)
      return (
        <G>
          <Path d="M41 103.5 q19 11 37 -1" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
          <Path d="M41.5 101.9 q18.5 10 36 -0.8" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
          <Path d="M79 103.5 q-19 11 -37 -1" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
          <Path d="M78.5 101.9 q-18.5 10 -36 -0.8" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
        </G>
      );
    case 'pawsTogether':
      // 両手を胸の前で合わせる(concern / applaud)。ホイッスルはこの上に重ねて描く
      return (
        <G>
          <Path d="M41 103 q6 6 13 7" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
          <Path d="M41.5 101.6 q5.6 5.6 12.4 6.6" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
          <Path d="M79 103 q-6 6 -13 7" stroke={SLEEVE} strokeWidth={10} strokeLinecap="round" fill="none" />
          <Path d="M78.5 101.6 q-5.6 5.6 -12.4 6.6" stroke={SLEEVE_HI} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={0.5} />
          <Circle cx={53.2} cy={110.2} r={5} fill={CUFF} />
          <Circle cx={66.8} cy={110.2} r={5} fill={CUFF} />
          <Circle cx={55.4} cy={111.2} r={4.6} fill={g.furHead} />
          <Circle cx={64.6} cy={111.2} r={4.6} fill={g.furHead} />
        </G>
      );
  }
}

/** 小物: おやすみの「zzz」(頭右上に3つ大きくなる。全体をわずかに傾ける) */
function Zzz() {
  return (
    <G>
      <G rotation={-8} origin="94, 39">
        <SvgText x={94} y={39} fontFamily={TEXT_FONT} fontSize={10} fontWeight="700" fill={ZZZ} opacity={0.75}>
          z
        </SvgText>
      </G>
      <G rotation={-8} origin="101, 30">
        <SvgText x={101} y={30} fontFamily={TEXT_FONT} fontSize={13} fontWeight="700" fill={ZZZ} opacity={0.85}>
          z
        </SvgText>
      </G>
      <G rotation={-8} origin="110, 20">
        <SvgText x={110} y={20} fontFamily={TEXT_FONT} fontSize={16} fontWeight="700" fill={ZZZ}>
          z
        </SvgText>
      </G>
    </G>
  );
}

/** 小物: 考え中の泡(静止版。ハイライトつき) */
function BubblesStatic() {
  return (
    <G>
      <Circle cx={97} cy={45} r={3.2} fill={BUBBLE} />
      <Circle cx={96} cy={44} r={1.1} fill="#FFFFFF" opacity={0.7} />
      <Circle cx={105.5} cy={35.5} r={5} fill={BUBBLE} />
      <Circle cx={103.8} cy={33.8} r={1.7} fill="#FFFFFF" opacity={0.7} />
    </G>
  );
}

/** 小物: 喜びのキラキラ(金+水辺ブルー) */
function Sparkles() {
  return (
    <G>
      <Path d="M13 56 l1.9 4.4 4.4 1.9 -4.4 1.9 -1.9 4.4 -1.9 -4.4 -4.4 -1.9 4.4 -1.9 Z" fill={GOLD} opacity={0.9} />
      <Path d="M105 58 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5 Z" fill={GOLD} opacity={0.85} />
      <Path d="M101 16 l1.2 2.8 2.8 1.2 -2.8 1.2 -1.2 2.8 -1.2 -2.8 -2.8 -1.2 2.8 -1.2 Z" fill={GOLD} opacity={0.7} />
      <Path d="M18 104 l1.2 2.8 2.8 1.2 -2.8 1.2 -1.2 2.8 -1.2 -2.8 -2.8 -1.2 2.8 -1.2 Z" fill={LANYARD} opacity={0.7} />
    </G>
  );
}

/** 小物: 拍手の動き線(両手の左右に二重の弧) */
function ClapArcs() {
  return (
    <G>
      <G stroke={ACCENT} strokeWidth={2} fill="none" strokeLinecap="round">
        <Path d="M46 102.5 q-4.5 5 -3.5 10.5" />
        <Path d="M74 102.5 q4.5 5 3.5 10.5" />
      </G>
      <G stroke={ACCENT} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.5}>
        <Path d="M42 100.5 q-6 6.5 -4.8 13.5" />
        <Path d="M78 100.5 q6 6.5 4.8 13.5" />
      </G>
    </G>
  );
}

// ===== ポーズ = パーツの組み合わせ定義 =====

type PoseDef = {
  arms: ArmsKind;
  brows?: 'normal' | 'worry';
  eyes: 'open' | 'happy' | 'closed' | 'wink';
  mouth: 'neutral' | 'smile' | 'open' | 'worry';
  extra?: 'bubbles' | 'sparkles' | 'zzz' | 'clapArcs';
  /** 腕が胸元を覆うポーズでは COACH ロゴを描かない */
  hideCoach?: boolean;
  /** ホイッスルの下げ幅(腕ポーズとの重なり調整。原本SVG準拠) */
  whistleDy?: number;
  /** 合わせた両手の上にホイッスルを重ねる(concern / applaud) */
  whistleOnHands?: boolean;
  /** ホイッスルの紐の先端Y(原本準拠: thinking のみ 116) */
  lanyardEnd?: number;
};

const POSES: Record<HotoriPose, PoseDef> = {
  normal: { arms: 'down', brows: 'normal', eyes: 'open', mouth: 'neutral' },
  guide: { arms: 'point', brows: 'normal', eyes: 'open', mouth: 'smile' },
  thinking: {
    arms: 'crossed',
    brows: 'normal',
    eyes: 'open',
    mouth: 'neutral',
    extra: 'bubbles',
    hideCoach: true,
    whistleDy: 1,
    lanyardEnd: 116,
  },
  celebrate: { arms: 'up', brows: 'normal', eyes: 'happy', mouth: 'open', extra: 'sparkles' },
  encourage: { arms: 'cheer', brows: 'normal', eyes: 'open', mouth: 'smile' },
  sleep: { arms: 'down', eyes: 'closed', mouth: 'neutral', extra: 'zzz' },
  concern: {
    arms: 'pawsTogether',
    brows: 'worry',
    eyes: 'open',
    mouth: 'worry',
    hideCoach: true,
    whistleDy: 2,
    whistleOnHands: true,
  },
  applaud: {
    arms: 'pawsTogether',
    brows: 'normal',
    eyes: 'happy',
    mouth: 'smile',
    extra: 'clapArcs',
    hideCoach: true,
    whistleDy: 2,
    whistleOnHands: true,
  },
  hero: { arms: 'heroBoard', brows: 'normal', eyes: 'wink', mouth: 'open' },
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
    // 達成の瞬間の演出なので1回だけ再生する(終了時は opacity 0 で自然に消える)
    progress.value = withTiming(1, { duration: 1700, easing: Easing.linear });
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

/** thinking: ふわっと浮かぶ泡(2つを位相ずらしで明滅)。静止泡と同じ白ハイライトつき */
function ThinkingBubble({
  cx,
  cy,
  r,
  hi,
  scale,
  initialDelay,
}: {
  cx: number;
  cy: number;
  r: number;
  /** ハイライト円(viewBox座標)。BubblesStatic と同じ値を渡す */
  hi: { cx: number; cy: number; r: number };
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
  const hd = 2 * hi.r * scale;
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
      ]}>
      {/* 白ハイライト(親の明滅opacityを継承する) */}
      <View
        style={{
          position: 'absolute',
          left: (hi.cx - hi.r - (cx - r)) * scale,
          top: (hi.cy - hi.r - (cy - r)) * scale,
          width: hd,
          height: hd,
          borderRadius: hd / 2,
          backgroundColor: '#FFFFFF',
          opacity: 0.7,
        }}
      />
    </Animated.View>
  );
}

// ===== 本体 =====

export function Hotori({ pose = 'normal', size = 96, animate, variant = 'full' }: HotoriProps) {
  const reduceMotion = useReduceMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = gradientUrls(uid);
  const anim = reduceMotion || variant === 'bust' ? undefined : animate;

  // 呼吸(上下3px)/ 跳ね を担う共有値。viewBox座標ではなく実pxで動かす
  const translateY = useSharedValue(0);
  // 瞬き: 0=開き目, 1=閉じ目
  const blink = useSharedValue(0);
  // celebrate の着地後に静止ポーズのキラキラをフェードインさせる不透明度
  const sparkle = useSharedValue(0);

  useEffect(() => {
    if (anim === 'celebrate') {
      // 跳ね(しゃがむ→跳ぶ→着地)。プロトタイプの hb-jump 相当。
      // 達成の瞬間の演出なので1回だけ再生し、着地後は静止ポーズ(キラキラつき)に戻る
      translateY.value = withSequence(
        withTiming(3, { duration: 310, easing: Easing.inOut(Easing.quad) }),
        withTiming(-15, { duration: 410, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 440, easing: Easing.in(Easing.quad) }),
      );
      sparkle.value = 0;
      sparkle.value = withDelay(1160, withTiming(1, { duration: 400 }));
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
    return () => {
      cancelAnimation(translateY);
      cancelAnimation(sparkle);
    };
  }, [anim, translateY, sparkle]);

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
  const sparkleProps = useAnimatedProps(() => ({ opacity: sparkle.value }));

  if (variant === 'bust') {
    // チャットアバター用: 頭部+胸元(パーカー・ホイッスル)、円形・水辺グラデ背景
    const bustHoodie =
      'M60 91.5 C52.5 91.5 47 94 44.8 98.8 C39.8 107.5 36 115.5 35.4 123.5 C34.8 131 34.8 140 35 150 L85 150 C85.2 140 85.2 131 84.6 123.5 C84 115.5 80.2 107.5 75.2 98.8 C73 94 67.5 91.5 60 91.5 Z';
    return (
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <CharacterDefs uid={uid} variant="bust" />
        <Circle cx={60} cy={60} r={60} fill={g.bustBg} />
        <G clipPath={`url(#${g.bustClip})`}>
          {/* 下ろしたフード(背面)。バストは全身より2px下に置く */}
          <G y={2}>
            <HoodBack g={g} />
          </G>
          <HeadBase g={g} variant="bust" />
          <Mouth kind="neutral" variant="bust" />
          <OpenEyes g={g} />
          <Brows kind="normal" />
          <HeadFront variant="bust" />
          {/* 首元の毛(バスト専用: 面積を縮小し明度を上げ、上端をなじませる) */}
          <Path d="M46 80.5 q14 8.5 28 0 q2.5 10.5 -14 10.5 q-16.5 0 -14 -10.5 Z" fill={g.neckG} />
          <Path d="M46 80.5 q14 8.5 28 0" fill="none" stroke="#B08F63" strokeWidth={1.8} strokeLinecap="round" opacity={0.5} />
          {/* パーカー本体(胸から円の下端まで) */}
          <Path d={bustHoodie} fill={g.hoodieBody} />
          <Path d={bustHoodie} fill={g.shadeBlue} />
          {/* 畳まれたフードのロール(前面)+ドローコード */}
          <HoodRoll g={g} variant="bust" />
          <Path d="M55.5 99.8 L54.1 103.1" fill="none" stroke="#DCEFF9" strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M64.5 99.8 L65.9 103.1" fill="none" stroke="#DCEFF9" strokeWidth={1.6} strokeLinecap="round" />
          <Circle cx={53.8} cy={104} r={1.05} fill={g.metal} stroke={METAL_EDGE} strokeWidth={0.4} />
          <Circle cx={66.2} cy={104} r={1.05} fill={g.metal} stroke={METAL_EDGE} strokeWidth={0.4} />
          {/* COACH+紐+ホイッスル(バスト用の小ぶり配置) */}
          <SvgText x={60} y={109} fontFamily={TEXT_FONT} fontSize={6} fontWeight="800" fill="#E3F4FC" textAnchor="middle" letterSpacing={0.7}>
            COACH
          </SvgText>
          <Path d="M43.5 100.5 L56 111" stroke={LANYARD} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <Path d="M76.5 100.5 L64 111" stroke={LANYARD} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <Rect x={52.5} y={109.5} width={11} height={7.5} rx={3.2} fill={g.metal} stroke={METAL_EDGE} strokeWidth={0.5} />
          <Rect x={53.1} y={110.1} width={9.8} height={2.8} rx={1.4} fill="#EDF3F7" opacity={0.85} />
          <Circle cx={63.4} cy={115.6} r={3.9} fill={g.metal} stroke={METAL_EDGE} strokeWidth={0.5} />
          <Circle cx={63.4} cy={115.6} r={1.5} fill="#6E7E8A" />
          {/* 円形の縁の落ち影 */}
          <Circle cx={60} cy={60} r={60} fill={g.vig} />
        </G>
        <Circle cx={60} cy={60} r={59.2} fill="none" stroke="#E3F4FC" strokeWidth={1.2} opacity={0.5} />
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
          <CharacterDefs uid={uid} variant="full" />
          <Tail g={g} />
          <HoodBack g={g} />
          <HeadBase g={g} variant="full" />
          <Mouth kind={def.mouth} />
          {blinking ? (
            <>
              <AnimatedG animatedProps={eyesOpenProps}>
                <OpenEyes g={g} />
              </AnimatedG>
              <AnimatedG animatedProps={eyesClosedProps}>
                <Eyes kind="closed" />
              </AnimatedG>
            </>
          ) : def.eyes === 'open' ? (
            <OpenEyes g={g} />
          ) : def.eyes === 'wink' ? (
            <WinkEyes g={g} />
          ) : (
            <Eyes kind={def.eyes} />
          )}
          {def.brows && <Brows kind={def.brows} />}
          <HeadFront variant="full" />
          <NeckFur g={g} />
          <HoodieBody g={g} />
          <HoodRoll g={g} />
          <Pocket />
          <ChestGear showCoach={!def.hideCoach} lanyardEnd={def.lanyardEnd} />
          {!def.whistleOnHands && <Whistle g={g} dy={def.whistleDy} />}
          <Feet g={g} />
          <Arms kind={def.arms} g={g} />
          {/* concern / applaud は合わせた両手の前にホイッスルが垂れる(紐は腕の後ろ) */}
          {def.whistleOnHands && <Whistle g={g} dy={def.whistleDy} />}
          {Extra && <Extra />}
          {/* celebrate 1回再生の締め: 着地後にキラキラを出して静止ポーズと同じ見た目にする */}
          {anim === 'celebrate' && def.extra === 'sparkles' && (
            <AnimatedG animatedProps={sparkleProps}>
              <Sparkles />
            </AnimatedG>
          )}
        </Svg>
      </Animated.View>
      {anim === 'thinking' && (
        <>
          <ThinkingBubble cx={97} cy={45} r={3.2} hi={{ cx: 96, cy: 44, r: 1.1 }} scale={px} initialDelay={0} />
          <ThinkingBubble cx={105.5} cy={35.5} r={5} hi={{ cx: 103.8, cy: 33.8, r: 1.7 }} scale={px} initialDelay={500} />
        </>
      )}
    </View>
  );
}
