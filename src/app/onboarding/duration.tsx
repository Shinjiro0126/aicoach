import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Hotori } from '@/components/hotori';
import { OnboardingNav } from '@/components/onboarding-steps';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { toHearingPairs } from '@/constants/hearing';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { suggestDuration } from '@/lib/ai/client';
import type { SuggestResponse } from '@/lib/ai/types';
import { clampWeeks, MAX_DURATION_WEEKS, MIN_DURATION_WEEKS, monthsToWeeks, weeksLabel } from '@/lib/roadmap';
import { useAppStore } from '@/stores/app';
import { useOnboardingStore } from '@/stores/onboarding';

/** プリセット4種(月数)。選択状態は週数に換算して一元管理する */
const PRESETS: { months: number; big: string; unit: string }[] = [
  { months: 1, big: '1', unit: 'ヶ月' },
  { months: 3, big: '3', unit: 'ヶ月' },
  { months: 6, big: '6', unit: 'ヶ月' },
  { months: 12, big: '1', unit: '年' },
];

/** ステッパーの丸ボタン(44ptタップ領域) */
function StepperButton({
  symbol,
  label,
  disabled,
  onPress,
}: {
  symbol: 'minus' | 'plus';
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepperButton,
        { backgroundColor: theme.background, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}>
      <SymbolView name={symbol} size={16} tintColor={theme.tintDeep} weight="semibold" />
    </Pressable>
  );
}

export default function DurationScreen() {
  const theme = useTheme();
  const { title, category, hearingAnswers, durationWeeks, setDurationWeeks } = useOnboardingStore();
  const { deviceId } = useAppStore();

  // AIの期間おすすめ。取得失敗時はカードを出さず通常フローにする(ブロッキングしない)
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    suggestDuration(
      {
        goalTitle: title,
        category: category ?? undefined,
        hearingAnswers: toHearingPairs(category, hearingAnswers),
      },
      deviceId,
    )
      .then((res) => {
        if (!cancelled) setSuggestion({ weeks: clampWeeks(res.weeks), reason: res.reason });
      })
      .catch(() => {
        // 失敗してもおすすめカードを出さないだけ(選択フローは通常どおり)
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [title, category, hearingAnswers, deviceId]);

  // ユーザー未選択の間は、AIおすすめ(なければ3ヶ月相当)を初期選択として表示する
  const selectedWeeks = durationWeeks ?? suggestion?.weeks ?? monthsToWeeks(3);

  const next = () => {
    // 初期選択のまま進んだ場合もストアに確定させる(戻ったときに選択が保持される)
    setDurationWeeks(selectedWeeks);
    router.push('/onboarding/why');
  };

  return (
    <Screen scroll>
      <OnboardingNav current={3} />

      <ThemedText type="subtitle">どのくらいの期間で{'\n'}目指しますか?</ThemedText>

      <View style={[styles.goalChip, { backgroundColor: theme.backgroundElement }]}>
        <SymbolView name="target" size={13} tintColor={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
        </ThemedText>
      </View>

      {loading && <View style={[styles.recoSkeleton, { backgroundColor: theme.backgroundElement }]} />}
      {!loading && suggestion && (
        <View style={[styles.recoCard, { backgroundColor: theme.tintSoft }]}>
          <Hotori variant="bust" size={40} />
          <View style={styles.recoBody}>
            <View style={[styles.recoBadge, { backgroundColor: theme.tint }]}>
              <SymbolView name="sparkles" size={11} tintColor={theme.onTint} />
              <ThemedText type="small" style={{ color: theme.onTint, fontWeight: '700', fontSize: 11, lineHeight: 14 }}>
                ホトリのおすすめ: {weeksLabel(suggestion.weeks)}
              </ThemedText>
            </View>
            <ThemedText type="small" style={styles.recoReason}>
              {suggestion.reason}
            </ThemedText>
          </View>
        </View>
      )}

      <View style={styles.grid}>
        {PRESETS.map((p) => {
          const weeks = monthsToWeeks(p.months);
          const selected = selectedWeeks === weeks;
          const recommended = suggestion?.weeks === weeks;
          return (
            <Pressable
              key={p.months}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${p.big}${p.unit}`}
              onPress={() => setDurationWeeks(weeks)}
              style={({ pressed }) => [
                styles.cell,
                {
                  backgroundColor: selected ? theme.tintSoft : theme.backgroundElement,
                  borderColor: selected ? theme.tint : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              {recommended && (
                <View style={[styles.miniBadge, { backgroundColor: theme.tint }]}>
                  <ThemedText type="small" style={{ color: theme.onTint, fontSize: 9, lineHeight: 12, fontWeight: '700' }}>
                    おすすめ
                  </ThemedText>
                </View>
              )}
              <ThemedText type="smallBold" style={styles.cellBig}>
                {p.big}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.cellUnit}>
                {p.unit}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.customBox, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">自分で決める</ThemedText>
        <View style={styles.stepper}>
          <StepperButton
            symbol="minus"
            label="1週間減らす"
            disabled={selectedWeeks <= MIN_DURATION_WEEKS}
            onPress={() => setDurationWeeks(clampWeeks(selectedWeeks - 1))}
          />
          <View style={styles.stepperValue}>
            <ThemedText style={styles.stepperNumber}>{selectedWeeks}</ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary">
              週間
            </ThemedText>
          </View>
          <StepperButton
            symbol="plus"
            label="1週間増やす"
            disabled={selectedWeeks >= MAX_DURATION_WEEKS}
            onPress={() => setDurationWeeks(clampWeeks(selectedWeeks + 1))}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerNote}>
          2週間〜2年の間で、1週間きざみで設定できます
        </ThemedText>
      </View>

      <View style={styles.bottomArea}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerNote}>
          期間は目安です。あとから目標を作り直すこともできます
        </ThemedText>
        <Button title="次へ" onPress={next} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one + 2,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  recoSkeleton: { borderRadius: 16, height: 88, opacity: 0.6 },
  recoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three - 4,
    borderRadius: 16,
    padding: Spacing.three - 2,
  },
  recoBody: { flex: 1, gap: Spacing.one + 2 },
  recoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  recoReason: { lineHeight: 21 },
  grid: { flexDirection: 'row', gap: Spacing.two },
  cell: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.one,
    alignItems: 'center',
  },
  miniBadge: {
    position: 'absolute',
    top: -9,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  cellBig: { fontSize: 16, lineHeight: 20 },
  cellUnit: { fontSize: 11, lineHeight: 14 },
  customBox: {
    borderRadius: 16,
    padding: Spacing.three - 2,
    gap: Spacing.two + 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three + 2,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  stepperValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Spacing.one,
    minWidth: 96,
  },
  stepperNumber: { fontSize: 22, lineHeight: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  centerNote: { textAlign: 'center' },
  bottomArea: { gap: Spacing.two, marginTop: Spacing.two },
});
