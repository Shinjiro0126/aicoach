import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Hotori } from '@/components/hotori';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { archiveGoal, deleteAllData, exportAllData, listReportDates } from '@/db/repo';
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

/** iOS標準パターンの設定行(アイコンチップ+ラベル+現在値+chevron) */
function SettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  value?: string;
  onPress: () => void;
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
      <ThemedText style={styles.settingValue} themeColor="textSecondary" numberOfLines={1}>
        {value ?? ''}
      </ThemedText>
      <SymbolView name="chevron.right" size={13} tintColor={theme.textSecondary} weight="semibold" />
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
  const [reportDates, setReportDates] = useState<string[]>([]);
  const refresh = useCallback(() => {
    if (activeGoal) setReportDates(listReportDates(activeGoal.id));
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
  const streak = computeStreak(reportDates, today);

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
          <StatPill label={`歩いた日 ${reportDates.length}日`} />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={confirmArchiveGoal}
          style={({ pressed }) => [styles.identityFooter, pressed && { opacity: 0.7 }]}>
          <SymbolView name="flag.fill" size={13} tintColor={theme.tintDeep} />
          <ThemedText style={[styles.footerLink, { color: theme.tintDeep }]}>目標を見直す</ThemedText>
        </Pressable>
      </View>

      {/* プレミアムカード */}
      <View style={[styles.card, { backgroundColor: theme.sand }]}>
        <View style={styles.rowBetween}>
          <ThemedText style={[styles.premiumHead, { color: theme.sandText }]}>プレミアム</ThemedText>
          <ThemedText style={[styles.premiumStatus, { color: theme.sandText }]}>
            現在: {premium ? 'プレミアム' : '無料プラン'}
          </ThemedText>
        </View>
        <ThemedText style={[styles.premiumLead, { color: theme.sandText }]}>
          ホトリの観察手帳で、あなたの歩き方を深く知る
        </ThemedText>
        {!premium && <Button title="プレミアムを見る" onPress={() => router.push('/paywall')} />}
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
          目標・記録・対話はすべて端末内に保存。品質改善のための匿名の診断データに、会話の内容は含まれません。
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
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  premiumHead: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  premiumStatus: { fontSize: 12, fontWeight: '600' },
  premiumLead: { fontSize: 15, fontWeight: '700', lineHeight: 22 },
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
