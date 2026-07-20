import { useEffect } from 'react';

import { toHearingPairs } from '@/constants/hearing';
import { suggestDurationWithFallback } from '@/lib/ai/client';
import { buildSuggestKey } from '@/lib/ai/suggest-fallback';
import type { SuggestResponse } from '@/lib/ai/types';
import { useAppStore } from '@/stores/app';
import { useOnboardingStore } from '@/stores/onboarding';

/**
 * 期間おすすめの先読みフック(橋渡しページと期間ページで共用)。
 * マウント時と入力(目標・カテゴリ・ヒアリング回答)が変わったときに見立ての取得を開始し、
 * 結果をオンボーディングストアで共有する。回答を変えて再訪した場合はキーが変わり再取得される。
 *
 * @returns 現在の入力に対応する解決済みの見立て(未解決・取得中は null)
 */
export function useSuggestPrefetch(): { suggestion: SuggestResponse | null } {
  const title = useOnboardingStore((s) => s.title);
  const category = useOnboardingStore((s) => s.category);
  const hearingAnswers = useOnboardingStore((s) => s.hearingAnswers);
  const entry = useOnboardingStore((s) => s.suggestion);
  const ensureSuggestion = useOnboardingStore((s) => s.ensureSuggestion);
  const deviceId = useAppStore((s) => s.deviceId);

  const key = buildSuggestKey(title, category, toHearingPairs(category, hearingAnswers));

  useEffect(() => {
    // フォールバック保証つき(reject しない)なので、ここでのエラーハンドリングは不要
    ensureSuggestion(key, () =>
      suggestDurationWithFallback(
        {
          goalTitle: title,
          category: category ?? undefined,
          hearingAnswers: toHearingPairs(category, hearingAnswers),
        },
        deviceId,
      ),
    );
  }, [key, ensureSuggestion, title, category, hearingAnswers, deviceId]);

  return { suggestion: entry?.key === key ? entry.result : null };
}
