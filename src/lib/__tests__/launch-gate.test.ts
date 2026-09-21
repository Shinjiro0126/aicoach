import {
  LAUNCH_MIN_VISIBLE_MS,
  minVisibleRemainingMs,
  shouldDismissLaunchOverlay,
} from '../launch-gate';

describe('shouldDismissLaunchOverlay', () => {
  test('準備が早く終わっても最小表示時間までは閉じない', () => {
    expect(shouldDismissLaunchOverlay({ ready: true, elapsedMs: 0 })).toBe(false);
    expect(
      shouldDismissLaunchOverlay({ ready: true, elapsedMs: LAUNCH_MIN_VISIBLE_MS - 1 }),
    ).toBe(false);
  });

  test('ちょうど最小表示時間に達した瞬間から閉じてよい(境界)', () => {
    expect(shouldDismissLaunchOverlay({ ready: true, elapsedMs: LAUNCH_MIN_VISIBLE_MS })).toBe(
      true,
    );
  });

  test('準備が遅い場合は最小時間を過ぎても閉じない(タイムアウトで強制的に閉じない)', () => {
    expect(shouldDismissLaunchOverlay({ ready: false, elapsedMs: LAUNCH_MIN_VISIBLE_MS })).toBe(
      false,
    );
    expect(shouldDismissLaunchOverlay({ ready: false, elapsedMs: 60_000 })).toBe(false);
  });

  test('準備完了かつ最小時間経過で閉じる', () => {
    expect(
      shouldDismissLaunchOverlay({ ready: true, elapsedMs: LAUNCH_MIN_VISIBLE_MS + 1 }),
    ).toBe(true);
  });

  test('minVisibleMs を上書きできる', () => {
    expect(shouldDismissLaunchOverlay({ ready: true, elapsedMs: 500, minVisibleMs: 500 })).toBe(
      true,
    );
    expect(shouldDismissLaunchOverlay({ ready: true, elapsedMs: 499, minVisibleMs: 500 })).toBe(
      false,
    );
  });
});

describe('minVisibleRemainingMs', () => {
  test('表示開始直後は最小表示時間ぶんの残りがある', () => {
    expect(minVisibleRemainingMs(0)).toBe(LAUNCH_MIN_VISIBLE_MS);
  });

  test('経過に応じて残りが減り、境界と超過後は0になる', () => {
    expect(minVisibleRemainingMs(300)).toBe(LAUNCH_MIN_VISIBLE_MS - 300);
    expect(minVisibleRemainingMs(LAUNCH_MIN_VISIBLE_MS)).toBe(0);
    expect(minVisibleRemainingMs(LAUNCH_MIN_VISIBLE_MS + 1000)).toBe(0);
  });

  test('minVisibleMs を上書きできる', () => {
    expect(minVisibleRemainingMs(100, 500)).toBe(400);
  });
});
