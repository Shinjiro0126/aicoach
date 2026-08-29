import { flagDayNotificationWeekday, weekStartNotificationWeekday } from './flag-day';

/**
 * ローカル通知の組み立て(純関数)。
 * expo-notifications への実登録は lib/notifications.ts が行い、ここでは
 * 「どのIDの通知を・どの文面で・いつ鳴らすか」だけを決める(テスト可能にするため)。
 */

export type NotificationTime = { hour: number; minute: number };

export type NotificationTrigger =
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'weekly'; weekday: number; hour: number; minute: number };

export type NotificationPlanItem = {
  identifier: string;
  title: string;
  body: string;
  trigger: NotificationTrigger;
};

export const MORNING_ID = 'daily-morning-reminder';
export const EVENING_ID = 'daily-evening-reflection';
export const FLAG_ID = 'weekly-flag-day';
/** 手帳更新通知(C-2・プレミアムのみ) */
export const NOTEBOOK_ID = 'weekly-notebook-ready';

/**
 * このアプリが登録しうる通知IDの全一覧。
 * 解除(cancelDailyNotifications)はこの一覧を必ず全件キャンセルするため、
 * プレミアムOFF・通知OFF・目標リセットのどの経路でも手帳通知が残らない
 */
export const ALL_NOTIFICATION_IDS = [MORNING_ID, EVENING_ID, FLAG_ID, NOTEBOOK_ID] as const;

/** 手帳更新通知の時刻: 朝リマインドの30分後(同時刻に2本重ねない) */
export function notebookNotificationTime(morning: NotificationTime): NotificationTime {
  const total = morning.hour * 60 + morning.minute + 30;
  return { hour: Math.floor(total / 60) % 24, minute: total % 60 };
}

/**
 * スケジュールする通知の一覧を組み立てる。
 * - 朝リマインド・夜振り返り(デイリー)と旗の日通知(週次・昼12:00)は全ユーザー
 * - 手帳更新通知(週初日=旗の日の翌日の朝)はプレミアムのみ
 *   (ローカル通知は週番号を動的更新できないため「第N週」は文面に入れない)
 */
export function buildNotificationPlans(
  goalTitle: string,
  morning: NotificationTime,
  evening: NotificationTime,
  startKey: string,
  premium: boolean,
): NotificationPlanItem[] {
  const plans: NotificationPlanItem[] = [
    {
      identifier: MORNING_ID,
      title: '今日の一歩',
      body: `「${goalTitle}」— 今日の最小行動を確認しましょう`,
      trigger: { type: 'daily', hour: morning.hour, minute: morning.minute },
    },
    {
      identifier: EVENING_ID,
      title: '今日はどうでしたか?',
      body: 'コーチと1分だけ振り返りましょう',
      trigger: { type: 'daily', hour: evening.hour, minute: evening.minute },
    },
    {
      identifier: FLAG_ID,
      title: '今日は旗の日です',
      body: '今週の旗が、すぐそこにあります。今週の歩みを、見に来てください。',
      trigger: { type: 'weekly', weekday: flagDayNotificationWeekday(startKey), hour: 12, minute: 0 },
    },
  ];
  if (premium) {
    const time = notebookNotificationTime(morning);
    plans.push({
      identifier: NOTEBOOK_ID,
      title: '観察手帳を書き終えました',
      body: 'あなたの1週間の見立てが、手帳にあります。',
      trigger: {
        type: 'weekly',
        weekday: weekStartNotificationWeekday(startKey),
        hour: time.hour,
        minute: time.minute,
      },
    });
  }
  return plans;
}
