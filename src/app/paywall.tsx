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
import { useApplyNotifications } from '@/hooks/use-apply-notifications';
import { useTheme } from '@/hooks/use-theme';
import { AnalyticsEvent, trackEvent } from '@/lib/analytics/posthog';
import { getMonthlyPlan, purchaseMonthly, restorePremium, type MonthlyPlan } from '@/lib/purchases';
import { useAppStore } from '@/stores/app';

/**
 * ペイウォール「手帳の売り場」(デザイン原本 Main.dc.html 準拠)。
 * 売るのは回数無制限ではなく「ホトリの観察手帳」。見本の手紙を最上部に置き、
 * 便益 → 観察期間の開示 → プライバシー → プラン → CTA の順に並べる。
 *
 * プランは月額一本。表示価格はハードコードせず、必ずRevenueCatのpriceString
 * (ストアのローカライズ済み価格)から取る。未接続モード(Expo Go・APIキー未設定)では
 * 価格を「準備中」とし、CTA・復元は従来どおり準備中の案内を出す
 */

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
    caption: '回数を気にせず、いつでもホトリに話せます',
  },
];

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
  // 購入成功時にプレミアム向け通知(手帳更新通知)を即反映するため、通知ON状態のみ購読する
  const notificationsEnabled = useAppStore((s) => s.notificationsEnabled);
  const applyNotifications = useApplyNotifications();
  /** 月額プランの表示情報。null = 未接続モードまたは読み込み前(準備中の振る舞い) */
  const [plan, setPlan] = useState<MonthlyPlan | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    trackEvent(AnalyticsEvent.PaywallViewed);
  }, []);

  // Offeringから価格・トライアル有無を取得する(未接続モードでは即nullが返り、準備中表示のまま)
  useEffect(() => {
    let cancelled = false;
    getMonthlyPlan().then((p) => {
      if (!cancelled && p) setPlan(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 購入成功・復元成功後の共通処理(通知ONならプレミアム向け通知を即反映して閉じる) */
  const finishAsPremium = async () => {
    if (notificationsEnabled) await applyNotifications(true, undefined, undefined, true);
    router.back();
  };

  /** 購入CTA。未接続モードでは決済が未公開である旨を正直に案内する(従来どおり) */
  const startPurchase = async () => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      const result = await purchaseMonthly();
      if (result === null) {
        Alert.alert(
          '準備中です',
          'プレミアムの提供開始まで、もう少しだけお待ちください。最初の手帳は、いまもどなたにも無料でお読みいただけます。',
        );
      } else if (result === 'purchased') {
        await finishAsPremium();
      } else if (result === 'failed') {
        Alert.alert('購入できませんでした', '通信環境をご確認のうえ、もう一度お試しください。');
      }
      // 'cancelled'(ユーザーが購入シートを閉じた)は何もしない
    } finally {
      setPurchasing(false);
    }
  };

  /** 購入の復元。未接続モードでは従来の案内文のまま(設定画面と同方針) */
  const restorePurchases = async () => {
    const result = await restorePremium();
    if (result === null) {
      Alert.alert('購入を復元', 'プレミアムの提供開始と同時に、ここから購入を復元できるようになります。');
      return;
    }
    if (result === 'restored') {
      Alert.alert('復元しました', 'おかえりなさい。プレミアムをご利用いただけます。', [
        { text: 'OK', onPress: () => void finishAsPremium() },
      ]);
    } else if (result === 'none') {
      Alert.alert('復元できる購入が見つかりません', 'このApple Accountでの購入履歴が見つかりませんでした。');
    } else {
      Alert.alert('復元できませんでした', '通信環境をご確認のうえ、もう一度お試しください。');
    }
  };

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  // CTAと審査必須の自動更新表記(価格は必ずpriceStringから。ハードコード禁止)
  const ctaTitle = !plan
    ? 'プレミアムをはじめる'
    : plan.hasIntroOffer
      ? '7日間無料ではじめる'
      : `${plan.priceString}/月ではじめる`;
  const renewalNote = !plan
    ? '自動更新の購読です。期間終了の24時間前までに、App Storeの設定からいつでも解約できます。'
    : plan.hasIntroOffer
      ? `7日間の無料期間終了後、${plan.priceString}/月で自動更新されます。期間終了の24時間前までに、App Storeの設定からいつでも解約できます。`
      : `${plan.priceString}/月で自動更新されます。期間終了の24時間前までに、App Storeの設定からいつでも解約できます。`;

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

      {/* プラン(月額一本)。価格はストアのローカライズ済み価格のみを表示する */}
      <View style={[styles.planCard, { borderColor: theme.tintDeep, backgroundColor: theme.background }]}>
        <ThemedText type="smallBold" style={{ fontSize: 12, color: theme.tintDeep }}>
          月額プラン
        </ThemedText>
        <ThemedText style={styles.planPrice}>{plan ? `${plan.priceString}/月` : '準備中'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
          {!plan
            ? '提供開始まで、もう少しだけお待ちください'
            : plan.hasIntroOffer
              ? 'はじめの7日間は無料'
              : 'いつでも解約できます'}
        </ThemedText>
      </View>

      {/* CTA(色は theme.tint = #2E9FD6 のまま) */}
      <Button title={ctaTitle} loading={purchasing} onPress={() => void startPurchase()} />
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={{ fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: -Spacing.two }}>
        {renewalNote}
      </ThemedText>

      {/* 脚注+リンク行 */}
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, textAlign: 'center' }}>
        複数の目標の同時進行は、準備ができ次第プレミアムに加わります。
      </ThemedText>
      <View style={styles.footerRow}>
        {/* 規約・ポリシーのURLは課金提供開始時に config.ts で設定する。未設定の間は行を出さない */}
        {Config.termsOfUseUrl.length > 0 && (
          <FooterLink label="利用規約" onPress={() => openUrl(Config.termsOfUseUrl)} />
        )}
        {Config.privacyPolicyUrl.length > 0 && (
          <FooterLink label="プライバシーポリシー" onPress={() => openUrl(Config.privacyPolicyUrl)} />
        )}
        <FooterLink label="購入を復元" onPress={() => void restorePurchases()} />
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
  planCard: { borderRadius: 14, borderWidth: 2, padding: Spacing.three - 2, gap: 3, alignItems: 'center' },
  planPrice: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
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
