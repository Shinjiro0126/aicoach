import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Hotori } from '@/components/hotori';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { Config } from '@/constants/config';
import { useTheme } from '@/hooks/use-theme';
import { AnalyticsEvent, trackEvent } from '@/lib/analytics/posthog';

/**
 * ペイウォール「手帳の売り場」(デザイン原本 Main.dc.html 準拠)。
 * 売るのは回数無制限ではなく「ホトリの観察手帳」。見本の手紙を最上部に置き、
 * 便益 → 観察期間の開示 → プライバシー → プラン選択 → CTA の順に並べる。
 */

/**
 * プラン表示価格(いずれも予定)。
 * TODO: RevenueCat(react-native-purchases)接続後、Offering の localizedPrice に差し替える
 */
const PLANS = {
  annual: { label: '年額', price: '¥4,800', caption: '月あたり ¥400' },
  monthly: { label: '月額', price: '¥600', caption: 'まずは1ヶ月から' },
} as const;

type PlanKey = keyof typeof PLANS;

const BENEFITS: { symbol: SFSymbol; title: string; caption: string }[] = [
  {
    symbol: 'book.closed',
    title: '週に一度の手紙',
    caption: '曜日のリズム・復帰力の観察と、来週の作戦まで',
  },
  {
    symbol: 'books.vertical',
    title: 'たまっていく手帳',
    caption: '過去の手紙はぜんぶ残り、歩き方の変化を読み返せます',
  },
  {
    symbol: 'ellipsis.bubble',
    title: '対話をもっと深く',
    caption: '回数の上限なしで、いつでもホトリに話せます',
  },
];

/** プラン選択カード(選択状態はチェックマークで明示し、タップで切替) */
function PlanCard({
  plan,
  selected,
  onPress,
}: {
  plan: (typeof PLANS)[PlanKey];
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${plan.label} ${plan.price}(${plan.caption})`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.planCard,
        selected
          ? { borderWidth: 2, borderColor: theme.tintDeep, backgroundColor: theme.background }
          : { borderWidth: 1, borderColor: theme.border },
        pressed && { opacity: 0.85 },
      ]}>
      <View
        style={[
          styles.planCheck,
          selected
            ? { backgroundColor: theme.tintDeep }
            : { borderWidth: 1.5, borderColor: theme.textSecondary },
        ]}>
        {selected && <SymbolView name="checkmark" size={11} tintColor={theme.background} weight="bold" />}
      </View>
      <ThemedText
        type="smallBold"
        style={{ fontSize: 12, color: selected ? theme.tintDeep : theme.textSecondary }}>
        {plan.label}
      </ThemedText>
      <ThemedText style={styles.planPrice}>{plan.price}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
        {plan.caption}
      </ThemedText>
    </Pressable>
  );
}

/** フッターの規約・復元リンク(44ptタップ領域) */
function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.footerLink, pressed && { opacity: 0.6 }]}>
      <ThemedText type="small" style={{ fontSize: 11, color: theme.tintDeep }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default function PaywallScreen() {
  const theme = useTheme();
  const [plan, setPlan] = useState<PlanKey>('annual');

  useEffect(() => {
    trackEvent(AnalyticsEvent.PaywallViewed);
  }, []);

  /**
   * 購入CTA。RevenueCat接続後は Purchases.purchasePackage() に差し替える。
   * それまでは、決済自体が未公開である旨を正直に案内する(設定画面の「購入を復元」と同じ方針)
   */
  const startPurchase = () => {
    Alert.alert(
      '準備中です',
      'プレミアムの提供開始まで、もう少しだけお待ちください。最初の手帳は、いまもどなたにも無料でお読みいただけます。',
    );
  };

  /** 購入の復元。RevenueCat接続後は Purchases.restorePurchases() に差し替える(設定画面と同文) */
  const restorePurchases = () => {
    Alert.alert('購入を復元', 'プレミアムの提供開始と同時に、ここから購入を復元できるようになります。');
  };

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Screen scroll>
      {/* 右上の閉じる(44×44pt) */}
      <View style={styles.closeRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="閉じる"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.6 }]}>
          <SymbolView name="xmark" size={18} tintColor={theme.textSecondary} weight="semibold" />
        </Pressable>
      </View>

      {/* ホトリ+見出し */}
      <View style={styles.hero}>
        <Hotori variant="bust" size={68} />
        <ThemedText style={styles.heroTitle}>ホトリの観察手帳</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          あなたの歩き方を、週に一度の手紙に。
        </ThemedText>
      </View>

      {/* 手帳の見本カード(浅瀬ソフト) */}
      <View style={[styles.sampleCard, { backgroundColor: theme.tintSoft }]}>
        <View style={styles.sampleHead}>
          <ThemedText style={[styles.sampleLabel, { color: theme.tintDeep }]}>
            手帳のなかみ(見本)
          </ThemedText>
          <View style={[styles.typePill, { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 11, color: theme.tintDeep }}>
              戻りの早い、堅実な歩き手
            </ThemedText>
          </View>
        </View>
        <ThemedText type="small" style={{ lineHeight: 25 }}>
          14日間、あなたの歩き方を見てきました。二度止まり、二度とも翌日に戻る歩き方は、私の経験ではいちばん遠くまで行きます。来週は、火曜の一歩をほんの少しだけ広げてみましょう。
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, textAlign: 'right' }}>
          — ホトリ
        </ThemedText>
      </View>

      {/* 便益3行 */}
      <View style={styles.benefits}>
        {BENEFITS.map(({ symbol, title, caption }) => (
          <View key={title} style={styles.benefitRow}>
            <View style={[styles.benefitIcon, { backgroundColor: theme.tintSoft }]}>
              <SymbolView name={symbol} size={16} tintColor={theme.tintDeep} />
            </View>
            <View style={styles.benefitBody}>
              <ThemedText type="smallBold">{title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 18 }}>
                {caption}
              </ThemedText>
            </View>
          </View>
        ))}
      </View>

      {/* 観察期間の開示 */}
      <View style={[styles.disclosure, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 19 }}>
          最初の手帳は、第1週の旗の日に書き上がります(1冊目はどなたにも無料)。曜日ごとのリズムなど、深い観察は週を重ねるほど増えていきます。
        </ThemedText>
      </View>

      {/* プライバシー行 */}
      <View style={styles.privacyRow}>
        <SymbolView name="lock.fill" size={13} tintColor={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, fontWeight: '600' }}>
          手帳も対話も、この iPhone の中だけに残ります
        </ThemedText>
      </View>

      {/* プラン選択(初期選択=年額) */}
      <View style={styles.planRow} accessibilityRole="radiogroup">
        <PlanCard plan={PLANS.annual} selected={plan === 'annual'} onPress={() => setPlan('annual')} />
        <PlanCard plan={PLANS.monthly} selected={plan === 'monthly'} onPress={() => setPlan('monthly')} />
      </View>
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={{ fontSize: 11, textAlign: 'center', marginTop: -Spacing.two }}>
        表示している価格は(予定)です。
      </ThemedText>

      {/* CTA(ラベルは選択プランを反映) */}
      <Button title={`${PLANS[plan].label} ${PLANS[plan].price} ではじめる`} onPress={startPurchase} />
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={{ fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: -Spacing.two }}>
        自動更新の購読です。期間終了の24時間前までに、App Storeの設定からいつでも解約できます。
      </ThemedText>

      {/* 脚注+リンク行 */}
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, textAlign: 'center' }}>
        複数の目標の同時進行は、準備ができ次第プレミアムに加わります。
      </ThemedText>
      <View style={styles.footerRow}>
        {/* 規約・ポリシーのURLはRevenueCat接続時に config.ts で設定する。未設定の間は行を出さない */}
        {Config.termsOfUseUrl.length > 0 && (
          <FooterLink label="利用規約" onPress={() => openUrl(Config.termsOfUseUrl)} />
        )}
        {Config.privacyPolicyUrl.length > 0 && (
          <FooterLink label="プライバシーポリシー" onPress={() => openUrl(Config.privacyPolicyUrl)} />
        )}
        <FooterLink label="購入を復元" onPress={restorePurchases} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  closeRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: -Spacing.five },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: Spacing.two },
  heroTitle: { fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  sampleCard: { borderRadius: 18, padding: Spacing.three, gap: Spacing.two + 2 },
  sampleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  sampleLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  typePill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    maxWidth: 200,
  },
  benefits: { gap: Spacing.three - 4, paddingHorizontal: Spacing.one },
  benefitRow: { flexDirection: 'row', gap: Spacing.three - 4, alignItems: 'flex-start' },
  benefitIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitBody: { flex: 1, gap: 2 },
  disclosure: { borderRadius: 14, paddingHorizontal: Spacing.three - 2, paddingVertical: Spacing.three - 4 },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  planRow: { flexDirection: 'row', gap: Spacing.two + 2 },
  planCard: { flex: 1, borderRadius: 14, padding: Spacing.three - 2, gap: 3 },
  planCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planPrice: { fontSize: 20, fontWeight: '800', lineHeight: 26 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: -Spacing.two,
  },
  footerLink: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
