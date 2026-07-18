import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Hotori } from '@/components/hotori';
import { PrivacyBadge } from '@/components/privacy-badge';
import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { Config } from '@/constants/config';
import {
  addCheckin,
  addCoachMessage,
  getCheckin,
  getTasksForDate,
  listCoachMessages,
  listReportDates,
  recentActionSummary,
} from '@/db/repo';
import type { CoachMessage } from '@/db/schema';
import { chatWithCoach } from '@/lib/ai/client';
import { OFFLINE_FALLBACK_MESSAGE } from '@/lib/ai/mock';
import { AiError, type CoachContext } from '@/lib/ai/types';
import { AnalyticsEvent, trackEvent } from '@/lib/analytics/posthog';
import { addDaysKey, todayKey } from '@/lib/dates';
import { computeStreak } from '@/lib/streak';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/stores/app';

/** 振り返り応答後のチップ。「休む」は正当な選択肢としてAIを呼ばずに完結する */
const CHIP_REST = '今日はこのまま休む';
const REFLECT_CHIPS = ['今日あったことを話す', 'ちょっと聞いてほしい', CHIP_REST];
const REFLECT_CHIPS_ZERO = ['今日あったことを話す', CHIP_REST];

export default function CoachScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const goal = useAppStore((s) => s.activeGoal);
  const { deviceId, canSendAiMessage, remainingAiMessages, consumeAiMessage, premium } = useAppStore();
  const params = useLocalSearchParams<{ autoReport?: string }>();

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [reflectionDone, setReflectionDone] = useState(true);
  const [chips, setChips] = useState<string[] | null>(null);
  /** 無料枠切れで自動報告をスキップしたときの控えめな案内(Issue #22) */
  const [quotaNotice, setQuotaNotice] = useState(false);
  const listRef = useRef<FlatList<CoachMessage>>(null);
  /** 同じ日の実績カードを二重投稿しないためのガード */
  const autoReportHandled = useRef<string | null>(null);

  const refresh = useCallback(() => {
    if (!goal) return;
    setMessages(listCoachMessages(goal.id));
    setReflectionDone(getCheckin(goal.id, todayKey()) !== undefined);
  }, [goal]);

  useFocusEffect(refresh);

  const buildContext = (mode: CoachContext['mode']): CoachContext => {
    if (!goal) throw new Error('no active goal');
    const today = todayKey();
    const last7 = Array.from({ length: 7 }, (_, i) => addDaysKey(today, -(6 - i)));
    return {
      goalTitle: goal.title,
      why: goal.why,
      recentDays: recentActionSummary(goal.id, last7),
      // ストリークは提出日(daily_reports)で数える
      streak: computeStreak(listReportDates(goal.id), today).current,
      mode,
    };
  };

  /**
   * 実際にメッセージを投稿できた場合のみ true を返す(送信中・無料枠切れの早期returnは false)。
   * quotaSilent: エフェクト起点の自動投稿用。無料枠切れでも paywall へ push せず静かに false を返す
   * (Issue #22: フォーカスエフェクトからの push はモーダルを閉じるたびに再実行され無限ループになるため)
   */
  const send = async (
    text: string,
    mode: CoachContext['mode'],
    opts?: { quotaSilent?: boolean },
  ): Promise<boolean> => {
    if (!goal || sending) return false;
    if (!canSendAiMessage()) {
      // paywall 誘導と QuotaExceeded 計測はユーザー操作起点の送信に限る
      if (!opts?.quotaSilent) {
        trackEvent(AnalyticsEvent.QuotaExceeded);
        router.push('/paywall');
      }
      return false;
    }
    setSending(true);
    setInput('');
    // 自由入力からの送信でも振り返りチップを畳む(送信後に古いチップが再表示されないように)
    setChips(null);
    const userMessage = addCoachMessage(goal.id, 'user', text);
    setMessages((prev) => [...prev, userMessage]);

    try {
      // 履歴はDBから直接組み立てる(未マウント時の自動報告で stale な messages state に依存しないため)。
      // userMessage は直前に addCoachMessage 済みなので、この一覧に含まれる
      const history = listCoachMessages(goal.id)
        .slice(-Config.coachHistoryLimit)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));
      const { reply } = await chatWithCoach({ context: buildContext(mode), messages: history }, deviceId);
      consumeAiMessage();
      const assistantMessage = addCoachMessage(goal.id, 'assistant', reply);
      setMessages((prev) => [...prev, assistantMessage]);
      // メッセージ本文は送らず、送信した事実(モード)のみ記録する
      trackEvent(AnalyticsEvent.CoachMessageSent, { mode });
      if (mode === 'reflection' && !reflectionDone) {
        addCheckin(goal.id, todayKey(), null, text);
        setReflectionDone(true);
      }
    } catch (e) {
      const fallback =
        e instanceof AiError && e.kind === 'rate_limited'
          ? '今日はたくさん話しましたね。少し時間をおいてまた話しましょう。'
          : OFFLINE_FALLBACK_MESSAGE;
      const assistantMessage = addCoachMessage(goal.id, 'assistant', fallback);
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
    // オフライン等の失敗時もユーザーの投稿自体は保存済みのため true(投稿できたか)を返す
    return true;
  };

  // 祝い演出の「ホトリのひとことを聞く」から遷移: 実績カード(今日のチェック結果)を自動投稿する
  useFocusEffect(
    useCallback(() => {
      const key = typeof params.autoReport === 'string' ? params.autoReport : undefined;
      if (!goal || !key || key !== todayKey() || autoReportHandled.current === key) return;
      autoReportHandled.current = key;
      const tasks = getTasksForDate(goal.id, key);
      const doneCount = tasks.filter((t) => t.done).length;
      const lines = tasks.map((t) => `・${t.done ? 'できた' : 'まだ'}:${t.title}`).join('\n');
      const text = `今日の記録を見せます(${doneCount}/${tasks.length})\n${lines}`;
      // 自動投稿は quotaSilent で送る: 枠切れでも paywall へ push しない(閉じる→再フォーカス→再push の
      // 無限ループ防止)。案内は下の控えめなバナーにとどめ、paywall への遷移はユーザーのタップに委ねる
      void send(text, 'reflection', { quotaSilent: true }).then((posted) => {
        if (posted) {
          setQuotaNotice(false);
          setChips(doneCount > 0 ? REFLECT_CHIPS : REFLECT_CHIPS_ZERO);
        } else {
          // 無料枠切れ等で投稿できなかった場合は未処理に戻す(プレミアム移行後の再訪で改めて投稿するため)。
          // paywall へは push しないので、再フォーカスしてもループはしない
          autoReportHandled.current = null;
          if (!canSendAiMessage()) setQuotaNotice(true);
        }
      });
      // send は毎レンダーで再生成されるため依存に含めない(二重投稿は autoReportHandled で防ぐ)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [goal, params.autoReport]),
  );

  if (!goal) return null;

  const onChip = (label: string) => {
    setChips(null);
    if (label === CHIP_REST) {
      // 「休む」を正当な行動として受け止める。AIは呼ばず端末内で完結する
      const assistantMessage = addCoachMessage(
        goal.id,
        'assistant',
        'はい、今日はこのままゆっくり休んでください。明日も、この道の続きで待っています。',
      );
      setMessages((prev) => [...prev, assistantMessage]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }
    void send(label, 'reflection');
  };

  const remaining = remainingAiMessages();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two, borderBottomColor: theme.border }]}>
        <View style={styles.headerLeft}>
          <Hotori variant="bust" size={40} />
          <View>
            <ThemedText type="smallBold" style={{ color: theme.tintDeep }}>
              ホトリ
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              あなたの目標の、先を歩いてきたコーチ
            </ThemedText>
          </View>
        </View>
        {!premium && (
          <ThemedText type="small" themeColor="textSecondary">
            今日あと{remaining}回
          </ThemedText>
        )}
      </View>

      {/* 対話が端末内にとどまることを、話すその場で伝える控えめな一行 */}
      <View style={styles.privacyRow}>
        <PrivacyBadge text="対話の履歴は、この端末の中だけに保存されます" />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) =>
          item.role === 'user' ? (
            <View style={[styles.bubble, styles.userBubble, { backgroundColor: theme.tint }]}>
              <ThemedText style={{ color: theme.onTint }}>{item.content}</ThemedText>
            </View>
          ) : (
            <View style={styles.assistantRow}>
              <Hotori variant="bust" size={28} />
              <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: theme.tintSoft }]}>
                <ThemedText style={{ color: theme.text }}>{item.content}</ThemedText>
              </View>
            </View>
          )
        }
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.six }}>
            今日の気分や困っていることを、気軽に話しかけてみてください。
          </ThemedText>
        }
      />

      {/* 無料枠切れで自動報告できなかったときの控えめな案内。paywall へはユーザーのタップでのみ遷移する */}
      {quotaNotice && !sending && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/paywall')}
          style={({ pressed }) => [
            styles.quotaNotice,
            { backgroundColor: theme.backgroundElement },
            pressed && { opacity: 0.8 },
          ]}>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', lineHeight: 20 }}>
            今日の無料枠を使い切ったため、ホトリのひとことは明日お伝えします。今日の記録は保存済みです
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: theme.tint, textAlign: 'center' }}>
            プレミアムの案内を見る
          </ThemedText>
        </Pressable>
      )}

      {chips && !sending && (
        <View style={styles.chipsWrap}>
          <View style={styles.chipsRow}>
            {chips.map((label) => (
              <Chip key={label} label={label} onPress={() => onChip(label)} />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            返信しなくても、今日の記録は保存済みです
          </ThemedText>
        </View>
      )}

      {!reflectionDone && !sending && (
        <Pressable
          accessibilityRole="button"
          onPress={() => send('今日の振り返りをお願いします。', 'reflection')}
          style={[styles.reflectionBanner, { backgroundColor: theme.tintSoft }]}>
          <SymbolView name="moon.stars" size={16} tintColor={theme.tint} />
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            今日の振り返りを始める(1分)
          </ThemedText>
        </Pressable>
      )}

      <View
        style={[
          styles.inputRow,
          { paddingBottom: insets.bottom + BottomTabInset + Spacing.two, borderTopColor: theme.border },
        ]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={sending ? 'コーチが考えています…' : 'メッセージを入力'}
          placeholderTextColor={theme.textSecondary}
          editable={!sending}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          multiline
        />
        <Pressable
          accessibilityRole="button"
          disabled={sending || input.trim().length === 0}
          onPress={() => send(input.trim(), 'chat')}
          style={({ pressed }) => [
            styles.sendButton,
            {
              backgroundColor: theme.tint,
              opacity: sending || input.trim().length === 0 ? 0.4 : pressed ? 0.8 : 1,
            },
          ]}>
          <ThemedText style={{ color: theme.onTint, fontWeight: '700' }}>↑</ThemedText>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
  privacyRow: { alignItems: 'center', paddingTop: Spacing.two, paddingHorizontal: Spacing.three },
  list: { padding: Spacing.three, gap: Spacing.two },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  assistantBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4, flexShrink: 1 },
  chipsWrap: { paddingHorizontal: Spacing.three, marginBottom: Spacing.two, gap: Spacing.two },
  quotaNotice: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  reflectionBanner: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    borderRadius: 12,
    padding: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    maxHeight: 120,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
