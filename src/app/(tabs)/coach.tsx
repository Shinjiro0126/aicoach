import { router, useFocusEffect } from 'expo-router';
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
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { Config } from '@/constants/config';
import {
  addCheckin,
  addCoachMessage,
  getCheckin,
  listCoachMessages,
  listDoneDates,
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

export default function CoachScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const goal = useAppStore((s) => s.activeGoal);
  const { deviceId, canSendAiMessage, remainingAiMessages, consumeAiMessage, premium } = useAppStore();

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [reflectionDone, setReflectionDone] = useState(true);
  const listRef = useRef<FlatList<CoachMessage>>(null);

  const refresh = useCallback(() => {
    if (!goal) return;
    setMessages(listCoachMessages(goal.id));
    setReflectionDone(getCheckin(goal.id, todayKey()) !== undefined);
  }, [goal]);

  useFocusEffect(refresh);

  if (!goal) return null;

  const buildContext = (mode: CoachContext['mode']): CoachContext => {
    const today = todayKey();
    const last7 = Array.from({ length: 7 }, (_, i) => addDaysKey(today, -(6 - i)));
    return {
      goalTitle: goal.title,
      why: goal.why,
      recentDays: recentActionSummary(goal.id, last7),
      streak: computeStreak(listDoneDates(goal.id), today).current,
      mode,
    };
  };

  const send = async (text: string, mode: CoachContext['mode']) => {
    if (sending) return;
    if (!canSendAiMessage()) {
      trackEvent(AnalyticsEvent.QuotaExceeded);
      router.push('/paywall');
      return;
    }
    setSending(true);
    setInput('');
    const userMessage = addCoachMessage(goal.id, 'user', text);
    setMessages((prev) => [...prev, userMessage]);

    try {
      const history = [...messages, userMessage].slice(-Config.coachHistoryLimit).map((m) => ({
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
