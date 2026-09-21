import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { PrivacyBadge } from '@/components/privacy-badge';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { archiveGoal, deleteAllData, exportAllData } from '@/db/repo';
import { toDateKey, todayKey } from '@/lib/dates';
import type { ThemePreference } from '@/lib/theme-preference';
import {
  cancelDailyNotifications,
  requestNotificationPermission,
  scheduleDailyNotifications,
} from '@/lib/notifications';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

const MORNING_OPTIONS = [6, 7, 8, 9];
const EVENING_OPTIONS = [20, 21, 22, 23];

/** 外観の3択。既定は「システムに合わせる」(OS設定に追従) */
const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'システムに合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const {
    activeGoal,
    morningTime,
    eveningTime,
    notificationsEnabled,
    premium,
    themePreference,
    setNotificationTimes,
    setNotificationsEnabled,
    setPremium,
    setThemePreference,
    setActiveGoal,
    setNextWeekPace,
    setReplanLetter,
    resetForDataDeletion,
  } = useAppStore();

  const applyNotifications = async (
    enabled: boolean,
    morning = morningTime,
    evening = eveningTime,
    isPremium = premium,
  ) => {
    if (!enabled) {
      await cancelDailyNotifications();
      setNotificationsEnabled(false);
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert('通知が許可されていません', 'iOSの設定アプリから通知を許可してください。');
      setNotificationsEnabled(false);
      return;
    }
    setNotificationsEnabled(true);
    if (activeGoal)
      await scheduleDailyNotifications(
        activeGoal.title,
        morning,
        evening,
        toDateKey(new Date(activeGoal.createdAt)),
        isPremium,
      );
  };

  /**
   * プレミアム切替は手帳更新通知(プレミアムのみ)の有無に効くため、
   * 通知ONなら即再スケジュールして反映する(OFF→再スケジュールで手帳通知は消える)
   */
  const togglePremium = (next: boolean) => {
    setPremium(next);
    if (notificationsEnabled) applyNotifications(true, morningTime, eveningTime, next);
  };

  const setMorning = (hour: number) => {
    const morning = { hour, minute: 0 };
    setNotificationTimes(morning, eveningTime);
    if (notificationsEnabled) applyNotifications(true, morning, eveningTime);
  };

  const setEvening = (hour: number) => {
    const evening = { hour, minute: 30 };
    setNotificationTimes(morningTime, evening);
    if (notificationsEnabled) applyNotifications(true, morningTime, evening);
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

  return (
    <Screen scroll withTabInset>
      <ThemedText type="subtitle" style={{ marginTop: Spacing.two }}>
        設定
      </ThemedText>

      <Card>
        <View style={styles.row}>
          <ThemedText type="smallBold">通知</ThemedText>
          <Switch
            value={notificationsEnabled}
            onValueChange={(v) => applyNotifications(v)}
            trackColor={{ true: theme.tint }}
          />
        </View>
        {notificationsEnabled && (
          <>
            <View style={styles.sectionLabel}>
              <SymbolView name="sun.horizon" size={14} tintColor={theme.warning} />
              <ThemedText type="small" themeColor="textSecondary">
                朝のリマインド
              </ThemedText>
            </View>
            <View style={styles.chips}>
              {MORNING_OPTIONS.map((h) => (
                <Chip key={h} label={`${h}:00`} selected={morningTime.hour === h} onPress={() => setMorning(h)} />
              ))}
            </View>
            <View style={styles.sectionLabel}>
              <SymbolView name="moon.stars" size={14} tintColor={theme.tint} />
              <ThemedText type="small" themeColor="textSecondary">
                夜の振り返り
              </ThemedText>
            </View>
            <View style={styles.chips}>
              {EVENING_OPTIONS.map((h) => (
                <Chip key={h} label={`${h}:30`} selected={eveningTime.hour === h} onPress={() => setEvening(h)} />
              ))}
            </View>
          </>
        )}
      </Card>

      <Card>
        <View style={styles.sectionLabel}>
          <SymbolView name="circle.lefthalf.filled" size={14} tintColor={theme.textSecondary} />
          <ThemedText type="smallBold">外観</ThemedText>
        </View>
        <View style={styles.chips}>
          {THEME_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={themePreference === option.value}
              onPress={() => setThemePreference(option.value)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <View style={styles.row}>
          <ThemedText type="smallBold">プラン</ThemedText>
          <ThemedText type="small" style={{ color: premium ? theme.tint : theme.textSecondary }}>
            {premium ? 'プレミアム' : '無料プラン'}
          </ThemedText>
        </View>
        {!premium && <Button title="プレミアムを見る" variant="secondary" onPress={() => router.push('/paywall')} />}
        {__DEV__ && (
          <Button
            title={`[DEV] プレミアム切替 (現在: ${premium ? 'ON' : 'OFF'})`}
            variant="ghost"
            onPress={() => togglePremium(!premium)}
          />
        )}
      </Card>

      <Card>
        <ThemedText type="smallBold">データ</ThemedText>
        <PrivacyBadge text="あなたの記録の置き場所: この iPhone の中だけ" />
        <ThemedText type="small" themeColor="textSecondary">
          目標・行動記録・対話履歴は、すべてこの端末の中だけに保存されます。AI応答の生成時にのみ必要なメッセージが中継されますが、サーバーには保存されません(匿名の診断データについては下記「品質改善へのご協力」をご覧ください)。
        </ThemedText>
        <Button title="データをエクスポート (JSON)" variant="secondary" onPress={exportData} />
        <Button title="目標をリセット" variant="secondary" onPress={confirmArchiveGoal} />
        <Button title="すべてのデータを削除" variant="danger" onPress={confirmDeleteAll} />
      </Card>

      <Card>
        <ThemedText type="smallBold">品質改善へのご協力</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          匿名の診断データ(クラッシュ情報・利用状況)を送信して品質改善に役立てています。個人を特定する情報や会話内容は送信されません。
        </ThemedText>
      </Card>

      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        バージョン {Constants.expoConfig?.version ?? '1.0.0'}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
