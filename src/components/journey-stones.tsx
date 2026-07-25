import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Ellipse, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { Hotori } from '@/components/hotori';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { journeySummaryLabel, type JourneyDay } from '@/lib/insight-stats';

/**
 * 飛び石の道のり(デザイン01/04)。
 * 直近14日をS字2段の飛び石で描画する。歩いた日=濃い石、報告した日=輪郭の薄い石、
 * おやすみ救済=葉の石、これから=点線。今日の石にはホトリ(bust)が立つ。
 * コールドスタート(記録2週未満)はスタートの岸+第1週の旗レイアウト。
 */

/** 水面の色(デザイン原本の --water / --water-deep / --stone。テーマ定義外の風景専用色) */
const WATER_COLORS = {
  light: { water: '#D5EEFB', waterDeep: '#BFE4F7', stone: '#8FCBE8', foam: 'rgba(255,255,255,0.55)' },
  dark: { water: '#0B2231', waterDeep: '#12354C', stone: '#23566F', foam: 'rgba(255,255,255,0.18)' },
} as const;

export type JourneyStonesProps = {
  /** 飛び石の日別データ(古い順)。通常14日 / コールドスタートは現在週7日 */
  days: JourneyDay[];
  weekNo: number;
  daysToFlag: number;
  /** 期日到達後はヘッダー右を到達コピーに切り替える */
  reached?: boolean;
  /** コールドスタート(記録2週未満)レイアウトにする */
  coldStart?: boolean;
  /** コールドスタート時に石の下へ出すキャプション */
  caption?: string;
};

/** 今日の石の上に立つホトリ(浮遊アニメ。reduce motion 時は静止) */
function FloatingBust({ size, reduce }: { size: number; reduce: boolean }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      translateY.value = 0;
      return;
    }
    // reverse:true の単一timing+sinイージングで正弦波状に往復させる
    // (2つのtimingを繋ぐと折り返しで速度が不連続になり、カクついて見える)
    translateY.value = withRepeat(withTiming(-3, { duration: 1500, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(translateY);
  }, [reduce, translateY]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  return (
    <Animated.View style={style}>
      <Hotori variant="bust" size={size} />
    </Animated.View>
  );
}

type StoneColors = {
  tint: string;
  tintDeep: string;
  tintSoft: string;
  water: string;
  stone: string;
  /** 波打ち際の泡の線(汀線) */
  foam: string;
};

/** 飛び石1つ。今日の石は状態に依らず深瀬ブルー(ホトリが立つ石) */
function StoneShape({
  day,
  cx,
  cy,
  colors,
}: {
  day: JourneyDay;
  cx: number;
  cy: number;
  colors: StoneColors;
}) {
  if (day.isToday) {
    return <Ellipse cx={cx} cy={cy} rx={14} ry={9.5} fill={colors.tintDeep} />;
  }
  switch (day.state) {
    case 'walked':
      return <Ellipse cx={cx} cy={cy} rx={13} ry={9} fill={colors.tint} />;
    case 'reported':
      return (
        <Ellipse cx={cx} cy={cy} rx={13} ry={9} fill={colors.water} stroke={colors.tint} strokeWidth={1.6} />
      );
    case 'grace':
      return (
        <G>
          <Ellipse cx={cx} cy={cy} rx={13} ry={9} fill={colors.tintSoft} />
          <Path
            d={`M${cx - 4} ${cy - 2} q4 -5 9 -2 q-1 6 -7 6 q-2 0 -2 -4`}
            fill={colors.tint}
            opacity={0.9}
          />
        </G>
      );
    case 'future':
      return (
        <Ellipse
          cx={cx}
          cy={cy}
          rx={12}
          ry={8.5}
          fill="none"
          stroke={colors.stone}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      );
    case 'missed':
      // 抜けた日: 水面下にうっすら沈んだ石(記録が無い事実を責めない控えめな表現)
      return <Ellipse cx={cx} cy={cy} rx={11} ry={7.5} fill={colors.stone} opacity={0.22} />;
  }
}

/** さざなみの短い曲線 */
function Ripples({ paths, stone }: { paths: string[]; stone: string }) {
  return (
    <G stroke={stone} strokeWidth={1} opacity={0.35} fill="none">
      {paths.map((d) => (
        <Path key={d} d={d} />
      ))}
    </G>
  );
}

// ---- 通常レイアウト(直近14日・S字2段) ----
// 上段: days[0..6](古い週・左→右)/ 折返し: days[7] / 下段: days[8..12](右→左)/ 今日: days[13]
const TOP_POSITIONS = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: 26 + 40 * i, y: i % 2 === 0 ? 44 : 38 }));
const FOLD_POSITION = { x: 296, y: 66 };
const BOTTOM_POSITIONS = [0, 1, 2, 3, 4].map((i) => ({ x: 262 - 38 * i, y: i % 2 === 0 ? 88 : 94 }));
const TODAY_POSITION = { x: 74, y: 94 };

function FullJourneySvg({ days, colors }: { days: JourneyDay[]; colors: StoneColors }) {
  const positions = [...TOP_POSITIONS, FOLD_POSITION, ...BOTTOM_POSITIONS, TODAY_POSITION];
  return (
    // height未指定だとreact-native-svgは高さ0で描画され、中身が一切見えない(親のaspectRatioを100%で埋める)。
    // 背景はSVG内に描かない: グラデ矩形を重ねるとカード背景との境界線が見えてしまうため、水面はカード背景色に任せる
    <Svg viewBox="0 0 316 132" width="100%" height="100%">
      <Ripples
        stone={colors.stone}
        paths={['M14 24 q7 -4 14 0', 'M250 18 q7 -4 14 0', 'M120 12 q7 -4 14 0', 'M60 118 q7 -4 14 0', 'M230 122 q7 -4 14 0']}
      />
      {days.slice(0, positions.length).map((day, i) => (
        <StoneShape key={day.dateKey} day={day} cx={positions[i].x} cy={positions[i].y} colors={colors} />
      ))}
      {/* これからの点線の石と次の旗(左岸) */}
      <Ellipse
        cx={40}
        cy={87}
        rx={12}
        ry={8.5}
        fill="none"
        stroke={colors.stone}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <G transform="translate(4, 56)">
        <Line x1={8} y1={24} x2={8} y2={2} stroke={colors.tintDeep} strokeWidth={2.2} strokeLinecap="round" />
        <Path d="M8 3 l13 4.5 -13 4.5 Z" fill={colors.tintDeep} />
      </G>
    </Svg>
  );
}

// ---- コールドスタートレイアウト(スタートの岸+第1週の旗) ----
// 先頭を x=64 に置き、岸と「スタート」の文字(〜x40)にホトリ(幅34)が被らないようにする
const COLD_POSITIONS = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: 64 + 36 * i, y: i % 2 === 0 ? 58 : 50 }));

function ColdJourneySvg({
  days,
  colors,
  sand,
  sandText,
}: {
  days: JourneyDay[];
  colors: StoneColors;
  sand: string;
  sandText: string;
}) {
  return (
    // height未指定だとreact-native-svgは高さ0で描画され、中身が一切見えない(親のaspectRatioを100%で埋める)。
    // 背景はSVG内に描かない: グラデ矩形を重ねるとカード背景との境界線が見えてしまうため、水面はカード背景色に任せる
    <Svg viewBox="0 0 316 108" width="100%" height="100%">
      <Ripples
        stone={colors.stone}
        paths={['M150 20 q7 -4 14 0', 'M250 88 q7 -4 14 0', 'M80 92 q7 -4 14 0']}
      />
      {/* スタートの岸: 画面左端から上下いっぱいに続く陸地。ゆらいだ汀線+泡+草+立て札で「岸」を記号化する */}
      {/* 陸地(波打つ海岸線で上下端まで) */}
      <Path
        d="M0 0 H30 Q38 14 30 26 Q42 40 33 56 Q42 72 30 86 Q24 96 28 108 H0 Z"
        fill={sand}
      />
      {/* 波打ち際の泡の線(汀線を少し水側でなぞる) */}
      <Path
        d="M33 0 Q41 14 33 26 Q45 40 36 56 Q45 72 33 86 Q27 96 31 108"
        stroke={colors.foam}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      {/* 岸辺の草 */}
      <G stroke={sandText} strokeWidth={1.3} strokeLinecap="round" opacity={0.7} fill="none">
        <Path d="M20 16 q1 -5 4 -7" />
        <Path d="M23 17 q0 -6 -2 -8" />
        <Path d="M14 76 q1 -5 4 -6" />
        <Path d="M17 77 q0 -5 -2 -7" />
      </G>
      {/* 小石 */}
      <Ellipse cx={12} cy={96} rx={3.6} ry={2.4} fill={sandText} opacity={0.3} />
      <Ellipse cx={21} cy={101} rx={2.6} ry={1.8} fill={sandText} opacity={0.22} />
      {/* 立て札「スタート」 */}
      <Line x1={16} y1={44} x2={16} y2={58} stroke={sandText} strokeWidth={2.4} strokeLinecap="round" />
      <Path
        d="M4 28 h24 q3 0 3 3 v10 q0 3 -3 3 h-24 q-3 0 -3 -3 v-10 q0 -3 3 -3 Z"
        fill={sandText}
      />
      <SvgText x={16} y={39} fontSize={7} fill={sand} fontWeight="700" textAnchor="middle">
        スタート
      </SvgText>
      {days.slice(0, COLD_POSITIONS.length).map((day, i) => (
        <StoneShape key={day.dateKey} day={day} cx={COLD_POSITIONS[i].x} cy={COLD_POSITIONS[i].y} colors={colors} />
      ))}
      {/* 週の旗(右岸) */}
      <G transform="translate(294, 24)">
        <Line x1={8} y1={26} x2={8} y2={2} stroke={colors.tintDeep} strokeWidth={2.2} strokeLinecap="round" />
        <Path d="M8 3 l-13 4.5 13 4.5 Z" fill={colors.tintDeep} />
      </G>
    </Svg>
  );
}

const BUST_SIZE = 34;

export function JourneyStones({ days, weekNo, daysToFlag, reached, coldStart, caption }: JourneyStonesProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const reduceMotion = useReduceMotion();
  const water = scheme === 'dark' ? WATER_COLORS.dark : WATER_COLORS.light;

  const colors: StoneColors = {
    tint: theme.tint,
    tintDeep: theme.tintDeep,
    tintSoft: theme.tintSoft,
    water: water.water,
    stone: water.stone,
    foam: water.foam,
  };

  const todayIndex = days.findIndex((d) => d.isToday);
  const viewHeight = coldStart ? 108 : 132;
  const todayPos = coldStart
    ? COLD_POSITIONS[Math.max(0, Math.min(todayIndex, COLD_POSITIONS.length - 1))]
    : TODAY_POSITION;

  const legendItems: { label: string; style: object }[] = [
    { label: '歩いた日', style: { backgroundColor: theme.tint } },
    { label: '報告した日', style: { borderWidth: 1.5, borderColor: theme.tint } },
    { label: 'おやすみ(守られた日)', style: { backgroundColor: theme.tintSoft } },
    { label: 'これから', style: { borderWidth: 1.5, borderColor: water.stone, borderStyle: 'dashed' } },
  ];

  return (
    <View
      accessible
      accessibilityLabel={journeySummaryLabel(days, weekNo, daysToFlag)}
      style={[styles.container, { backgroundColor: water.water }]}>
      <View style={styles.head}>
        <ThemedText type="small" style={[styles.headTitle, { color: theme.tintDeep }]}>
          あなたの道のり
        </ThemedText>
        <ThemedText type="small" style={[styles.headSub, { color: theme.tintDeep }]}>
          {reached
            ? 'ゴールまで、歩き切りました'
            : daysToFlag <= 0
              ? `第${weekNo}週 · 今日は旗の日`
              : `第${weekNo}週 · 旗まであと${daysToFlag}日`}
        </ThemedText>
      </View>

      <View style={{ aspectRatio: 316 / viewHeight }}>
        {coldStart ? (
          <ColdJourneySvg days={days} colors={colors} sand={theme.sand} sandText={theme.sandText} />
        ) : (
          <FullJourneySvg days={days} colors={colors} />
        )}
        {todayIndex >= 0 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: `${(todayPos.x / 316) * 100}%`,
              bottom: `${((viewHeight - todayPos.y + 4) / viewHeight) * 100}%`,
              marginLeft: -BUST_SIZE / 2,
              marginBottom: -6,
            }}>
            <FloatingBust size={BUST_SIZE} reduce={reduceMotion} />
          </View>
        )}
      </View>

      {coldStart && caption ? (
        <ThemedText type="small" style={[styles.caption, { color: theme.tintDeep }]}>
          {caption}
        </ThemedText>
      ) : null}

      <View style={styles.legend}>
        {legendItems.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, item.style]} />
            <ThemedText type="small" style={[styles.legendText, { color: theme.tintDeep }]}>
              {item.label}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.two + 2,
    gap: Spacing.one,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: Spacing.one },
  headTitle: { fontSize: 12, fontWeight: '800' },
  headSub: { fontSize: 11, opacity: 0.8 },
  caption: { fontSize: 11, fontWeight: '700', paddingHorizontal: Spacing.one },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two + 2, paddingHorizontal: Spacing.one, paddingTop: Spacing.one },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 11, height: 8, borderRadius: 5 },
  legendText: { fontSize: 9.5, opacity: 0.9 },
});
