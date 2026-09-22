import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Hotori } from '@/components/hotori';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { archiveGoal, deleteAllData, exportAllData, listReports } from '@/db/repo';
import { toDateKey, todayKey } from '@/lib/dates';
import { cancelDailyNotifications } from '@/lib/notifications';
import { progressSummary } from '@/lib/progress';
import { addWeeksKey, weekIndex } from '@/lib/roadmap';
import { computeStreak } from '@/lib/streak';
import { THEME_PREFERENCE_OPTIONS } from '@/lib/theme-preference';
import { useApplyNotifications } from '@/hooks/use-apply-notifications';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

/** アイデンティティカードの統計ピル(白背景・tintDeep文字) */
function StatPill({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: theme.background }]}>
      <ThemedText style={[styles.pillText, { color: theme.tintDeep }]}>{label}</ThemedText>
    </View>
  );
}

/**
 * iOS標準パターンの設定行(アイコンチップ+ラベル+現在値+末尾アイコン)。
 * trailing: chevron=画面内遷移 / external=外部アプリへ / none=その場で完結する操作。
 * valueTone: accent は契約中プランなど「良い状態」の強調表示に使う
 */
function SettingRow({
  icon,
  label,
  value,
  onPress,
  trailing = 'chevron',
  valueTone,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  value?: string;
  onPress: () => void;
  trailing?: 'chevron' | 'external' | 'none';
  valueTone?: 'accent';
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, pressed && { opacity: 0.7 }]}>
      <View style={[styles.iconChip, { backgroundColor: theme.tintSoft }]}>
        <SymbolView name={icon} size={15} tintColor={theme.tintDeep} />
      </View>
      <ThemedText style={styles.settingLabel}>{label}</ThemedText>
      <ThemedText
        style={[styles.settingValue, valueTone === 'accent' && { color: theme.tintDeep, fontWeight: '700' }]}
        themeColor={valueTone === 'accent' ? undefined : 'textSecondary'}
        numberOfLines={1}>
        {value ?? ''}
      </ThemedText>
      {trailing === 'chevron' && (
        <SymbolView name="chevron.right" size={13} tintColor={theme.textSecondary} weight="semibold" />
      )}
      {trailing === 'external' && (
        <SymbolView name="arrow.up.right" size={12} tintColor={theme.textSecondary} weight="semibold" />
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const theme = useTheme();
  const {
    activeGoal,
    morningTime,
    eveningTime,
    notificationsEnabled,
    premium,
    themePreference,
    setPremium,
    setActiveGoal,
    setNextWeekPace,
    setReplanLetter,
    resetForDataDeletion,
  } = useAppStore();
  const applyNotifications = useApplyNotifications();

  // 統計ピル(連続・ベスト・歩いた日)は提出記録から計算するため、タブ表示のたびに読み直す
  const [reports, setReports] = useState<ReturnType<typeof listReports>>([]);
  const refresh = useCallback(() => {
    if (activeGoal) setReports(listReports(activeGoal.id));
  }, [activeGoal]);
  useFocusEffect(refresh);

  /**
   * プレミアム切替は手帳更新通知(プレミアムのみ)の有無に効くため、
   * 通知ONなら即再スケジュールして反映する(OFF→再スケジュールで手帳通知は消える)
   */
  const togglePremium = (next: boolean) => {
    setPremium(next);
    if (notificationsEnabled) applyNotifications(true, morningTime, eveningTime, next);
  };

  /**
   * エクスポートJSONを一時ファイルに書き出し、ファイルとして共有する。
   * 生テキスト共有(Share.share の message)ではチャット等へ全文が貼り付いて
   * 誤共有しやすいため、ファイル共有に統一した。
   * 一時ファイルは共有完了後(エラー時も)必ず削除する
   */
  const shareExportFile = async (includeConversations: boolean) => {
    const file = new File(Paths.cache, `hotori-export-${todayKey()}.json`);
    try {
      file.create({ intermediates: true, overwrite: true });
      file.write(exportAllData(includeConversations));
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: 'ホトリのデータをエクスポート',
      });
    } catch {
      Alert.alert('エクスポートできませんでした', '少し時間をおいて、もう一度お試しください。');
    } finally {
      try {
        file.delete();
      } catch {
        // 書き出し前に失敗した場合など。キャッシュ領域はOSが回収するため放置してよい
      }
    }
  };

  /** エクスポート内容の選択。既定は記録のみ(対話全文を渡したい人だけ「すべて」を選ぶ) */
  const exportData = () => {
    Alert.alert(
      'データをエクスポート',
      'エクスポートに含める内容を選べます。「すべて」には、ホトリとの対話の全文とヒアリングの回答が含まれます。',
      [
        { text: '記録のみ(推奨)', onPress: () => shareExportFile(false) },
        { text: 'すべて(対話履歴を含む)', onPress: () => shareExportFile(true) },
        { text: 'キャンセル', style: 'cancel' },
      ],
    );
  };

  const confirmDeleteAll = () => {
    Alert.alert('すべてのデータを削除', 'この操作は取り消せません。目標・記録・対話履歴がすべて削除されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          deleteAllData();
          await cancelDailyNotifications();
          // 永続ストアも初期状態へ戻す(deviceId 新規生成・無料枠や歩幅宣言もリセット。
          // premium=購入状態のみ維持)。activeGoal のクリアも含む
          resetForDataDeletion();
          router.replace('/onboarding/category');
        },
      },
    ]);
  };

  /**
   * 購入の復元。RevenueCat接続後は Purchases.restorePurchases() に差し替える。
   * それまでは、決済自体が未公開である旨を正直に案内する(ペイウォールの「準備中」と同じ方針)
   */
  const restorePurchases = () => {
    Alert.alert('購入を復元', 'プレミアムの提供開始と同時に、ここから購入を復元できるようになります。');
  };

  /** App Storeのサブスクリプション管理画面を開く(OS標準の管理場所へ誘導する) */
  const openSubscriptionManagement = () => {
    Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {
      Alert.alert('開けませんでした', 'App Storeの「サブスクリプション」から確認できます。');
    });
  };

  const confirmArchiveGoal = () => {
    if (!activeGoal) return;
    Alert.alert('目標をリセット', '現在の目標をアーカイブして、新しい目標を設定します。記録は残ります。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'リセットする',
        onPress: async () => {
          archiveGoal(activeGoal.id);
          // 旧目標の通知(旧目標名の文面・手帳通知含む)を確実に解除する。
          // 新目標のオンボーディング完了時(plan.tsx)に通知ONなら再スケジュールされる
          await cancelDailyNotifications();
          setActiveGoal(null);
          // 旧目標の歩幅宣言・リプランの手紙は goalId 照合で新目標には効かないが、残しておく理由も無いので消す
          setNextWeekPace(null);
          setReplanLetter(null);
          router.replace('/onboarding/category');
        },
      },
    ]);
  };

  // アクティブ目標が無い間((tabs)/_layout がオンボーディングへ戻す直前)は何も描かない
  if (!activeGoal) return null;

  const today = todayKey();
  const startKey = toDateKey(new Date(activeGoal.createdAt));
  const targetKey = activeGoal.targetDate ?? addWeeksKey(startKey, 13);
  // 日数・週番号はホーム・セレモニーと同じ共有ロジックを使う(独自計算で1日ズレを作らない)。
  // elapsedDays は progressSummary、週番号は weekFlagInfo.weekNo と同じ weekIndex+1(クランプなし)
  const elapsedDays = progressSummary(startKey, targetKey, today).elapsedDays;
  const weekNo = weekIndex(startKey, today) + 1;
  // ストリークは全提出日(0件提出も含む)で計算し、「歩いた日」はチェック1件以上の提出日のみ数える。
  // 観察手帳(computeInsightStats の walkedDays)と同じ定義に揃え、画面間で数字がズレないようにする
  const streak = computeStreak(reports.map((r) => r.dateKey), today);
  const walkedDays = reports.filter((r) => r.doneCount > 0).length;

  const fmtTime = (t: { hour: number; minute: number }) => `${t.hour}:${String(t.minute).padStart(2, '0')}`;
  const notificationValue = notificationsEnabled ? `朝 ${fmtTime(morningTime)} · 夜 ${fmtTime(eveningTime)}` : 'オフ';
  const appearanceValue =
    THEME_PREFERENCE_OPTIONS.find((o) => o.value === themePreference)?.label ?? 'システムに合わせる';

  return (
    <Screen scroll withTabInset>
      <ThemedText type="subtitle" style={{ marginTop: Spacing.two }}>
        プロフィール
      </ThemedText>

      {/* アイデンティティカード: ホトリと歩いてきた道のりの現在地 */}
      <View style={[styles.card, { backgroundColor: theme.tintSoft }]}>
        <View style={styles.identityTop}>
          <View style={[styles.avatarRing, { borderColor: theme.background }]}>
            <Hotori variant="bust" size={60} />
          </View>
          <View style={styles.identityBody}>
            <ThemedText style={styles.goalTitle} numberOfLines={2}>
              {activeGoal.title}
            </ThemedText>
            <ThemedText style={styles.identitySub} themeColor="textSecondary">
              歩きはじめて{elapsedDays}日目 · 第{weekNo}週
            </ThemedText>
          </View>
        </View>
        <View style={styles.pills}>
          <StatPill label={`連続 ${streak.current}日`} />
          <StatPill label={`ベスト ${streak.best}日`} />
          <StatPill label={`歩いた日 ${walkedDays}日`} />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={confirmArchiveGoal}
          style={({ pressed }) => [styles.identityFooter, pressed && { opacity: 0.7 }]}>
          <SymbolView name="flag.fill" size={13} tintColor={theme.tintDeep} />
          <ThemedText style={[styles.footerLink, { color: theme.tintDeep }]}>目標を見直す</ThemedText>
        </Pressable>
      </View>

      {/* プランカード: 契約状態の確認・管理の場所。他カードと同じ行リスト様式で統一する。
          RevenueCat接続後は、更新日の表示と復元・管理の実処理をここに差し込む */}
      <View style={[styles.card, styles.listCard, styles.outlined, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <SettingRow
          icon="sparkles"
          label="プラン"
          value={premium ? 'プレミアム' : '無料'}
          valueTone={premium ? 'accent' : undefined}
          trailing={premium ? 'none' : 'chevron'}
          onPress={premium ? openSubscriptionManagement : () => router.push('/paywall')}
        />
        <ThemedText style={styles.planCaption} themeColor="textSecondary">
          {premium
            ? // TODO(RevenueCat): 接続後は「年額プラン · 次回の更新は◯月◯日」を表示する
              'プレミアムをご利用中です'
            : 'プレミアムにすると、観察手帳とホトリの深掘りが開きます'}
        </ThemedText>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        {premium ? (
          <SettingRow
            icon="gearshape"
            label="サブスクリプションを管理"
            trailing="external"
            onPress={openSubscriptionManagement}
          />
        ) : (
          <SettingRow icon="arrow.clockwise" label="購入を復元" trailing="none" onPress={restorePurchases} />
        )}
        {__DEV__ && (
          <Button
            title={`[DEV] プレミアム切替 (現在: ${premium ? 'ON' : 'OFF'})`}
            variant="ghost"
            onPress={() => togglePremium(!premium)}
          />
        )}
      </View>

      {/* 設定リスト: サブ画面へプッシュ遷移 */}
      <View style={[styles.card, styles.listCard, styles.outlined, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <SettingRow
          icon="bell.fill"
          label="通知"
          value={notificationValue}
          onPress={() => router.push('/settings/notifications')}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingRow
          icon="circle.lefthalf.filled"
          label="外観"
          value={appearanceValue}
          onPress={() => router.push('/settings/appearance')}
        />
      </View>

      {/* データとプライバシー */}
      <View style={[styles.card, styles.outlined, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <View style={styles.privacyHead}>
          <SymbolView name="lock.fill" size={13} tintColor={theme.textSecondary} />
          <ThemedText style={styles.privacyTitle} themeColor="textSecondary">
            あなたの記録は、この iPhone の中だけ
          </ThemedText>
        </View>
        <ThemedText style={styles.privacyDesc} themeColor="textSecondary">
          目標・記録・対話はすべて端末内に保存。AI応答の生成時にのみ必要なメッセージが中継されますが、サーバーには保存されません。品質改善のための匿名の診断データに、会話の内容は含まれません。
        </ThemedText>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingRow icon="square.and.arrow.up" label="データをエクスポート" onPress={exportData} />
      </View>

      {/* 危険操作(独立カード) */}
      <View style={[styles.card, styles.listCard, styles.outlined, { borderColor: theme.danger, backgroundColor: theme.background }]}>
        <Pressable
          accessibilityRole="button"
          onPress={confirmDeleteAll}
          style={({ pressed }) => [styles.settingRow, pressed && { opacity: 0.7 }]}>
          <SymbolView name="trash" size={16} tintColor={theme.danger} />
          <ThemedText style={[styles.settingLabel, { color: theme.danger }]}>すべてのデータを削除</ThemedText>
        </Pressable>
      </View>

      <ThemedText style={styles.version} themeColor="textSecondary">
        バージョン {Constants.expoConfig?.version ?? '1.0.0'}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: Spacing.three, gap: Spacing.two + 2 },
  outlined: { borderWidth: 1 },
  listCard: { paddingVertical: Spacing.one, gap: 0 },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4 },
  avatarRing: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityBody: { flex: 1, gap: 2 },
  goalTitle: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  identitySub: { fontSize: 13, lineHeight: 18 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pill: { borderRadius: 999, paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.one + 1 },
  pillText: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  identityFooter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, alignSelf: 'flex-start' },
  footerLink: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  // プラン行の補足(アイコンチップ幅28+gap10=38でラベルに揃える)
  planCaption: { fontSize: 12, lineHeight: 17, paddingLeft: 38, paddingBottom: Spacing.two + 2, marginTop: -Spacing.one },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, paddingVertical: Spacing.two + 2 },
  iconChip: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '700' },
  settingValue: { flex: 1, textAlign: 'right', fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  privacyHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  privacyTitle: { fontSize: 13, fontWeight: '700', flexShrink: 1, lineHeight: 18 },
  privacyDesc: { fontSize: 12, lineHeight: 18 },
  version: { fontSize: 12, textAlign: 'center' },
});
