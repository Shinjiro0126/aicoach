import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

import { Config } from '@/constants/config';
import { useAppStore } from '@/stores/app';

/**
 * RevenueCat(react-native-purchases)の薄いラッパー。
 *
 * このアプリはExpo Goでも動作確認する運用のため、ネイティブモジュールは
 * 遅延require+try/catchで読み込む。ネイティブ不在(Expo Go)または
 * EXPO_PUBLIC_REVENUECAT_IOS_API_KEY 未設定のときは「未接続モード」となり、
 * 各関数は null / false を返して呼び出し側(ペイウォール・設定)が従来の
 * 準備中の案内を出す(coachApiUrl 未設定でモックへフォールバックする既存思想と同じ)。
 *
 * プライバシー: RevenueCatへ送るのは購入処理そのものだけ。会話テキスト・目標名などの
 * アプリ内データは一切渡さない(configureは匿名IDで行い、attributesも設定しない)。
 */

/** RevenueCatダッシュボードで作成するエンタイトルメントID */
const ENTITLEMENT_ID = 'premium';

type PurchasesModule = typeof import('react-native-purchases').default;

/** ペイウォールが表示する月額プランの情報(価格はストアのローカライズ済み文字列のみ) */
export type MonthlyPlan = {
  /** ストアのローカライズ済み価格(例: 「¥600」)。ハードコード表示は禁止で、必ずこれを使う */
  priceString: string;
  /** イントロダクトリーオファー(7日間無料トライアル)が設定されているか */
  hasIntroOffer: boolean;
};

export type PurchaseResult = 'purchased' | 'cancelled' | 'failed';
export type RestoreResult = 'restored' | 'none' | 'failed';

let purchasesModule: PurchasesModule | null = null;
/** configure が成功したときだけ true(未接続モードの判定に使う) */
let configured = false;
/** 直近に取得した月額パッケージ(購入時に再取得しないためのキャッシュ) */
let monthlyPackage: PurchasesPackage | null = null;

/**
 * ネイティブモジュールを遅延読み込みする。Expo Goには存在しないため、
 * requireやネイティブ参照が失敗したら null を返して未接続モードにする
 */
function loadModule(): PurchasesModule | null {
  if (purchasesModule) return purchasesModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases') as { default: PurchasesModule };
    purchasesModule = mod.default ?? null;
  } catch {
    purchasesModule = null;
  }
  return purchasesModule;
}

/** customerInfo のエンタイトルメントからストアの premium フラグを同期する */
function syncPremiumFromCustomerInfo(info: CustomerInfo): boolean {
  const active = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  const store = useAppStore.getState();
  if (store.premium !== active) store.setPremium(active);
  return active;
}

/** 課金基盤に接続済みか(未接続=Expo Go・APIキー未設定・configure失敗) */
export function isPurchasesConnected(): boolean {
  return configured;
}

/**
 * 起動時の初期化。APIキー未設定・ネイティブ不在なら何もしない(no-op)。
 * 接続できた場合は customerInfo の更新リスナーを張り、購入・失効・復元を
 * ストアの premium フラグへ自動反映する
 */
export function initPurchases(): void {
  if (configured) return;
  if (!Config.revenueCatIosApiKey) return;
  const Purchases = loadModule();
  if (!Purchases) return;
  try {
    Purchases.configure({ apiKey: Config.revenueCatIosApiKey });
    configured = true;
    Purchases.addCustomerInfoUpdateListener((info) => {
      syncPremiumFromCustomerInfo(info);
    });
  } catch {
    // configure に失敗した場合(ネイティブ不整合など)は未接続モードのまま起動を続ける。
    // 課金が使えないだけでアプリ本体は通常どおり動く(起動クラッシュさせない)
    configured = false;
  }
}

/**
 * 現在のOfferingから月額パッケージ($rc_monthly)の表示情報を取得する。
 * 未接続・取得失敗・パッケージ未設定のときは null(UI側は準備中の振る舞いを維持する)
 */
export async function getMonthlyPlan(): Promise<MonthlyPlan | null> {
  const Purchases = loadModule();
  if (!configured || !Purchases) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.monthly ?? null;
    monthlyPackage = pkg;
    if (!pkg) return null;
    return {
      priceString: pkg.product.priceString,
      hasIntroOffer: pkg.product.introPrice !== null,
    };
  } catch {
    return null;
  }
}

/**
 * 月額プランを購入する。成功時はエンタイトルメントからストアの premium を同期する。
 * 未接続なら null(UI側は準備中Alert)。ユーザーキャンセルは 'cancelled' で、Alertは出さない
 */
export async function purchaseMonthly(): Promise<PurchaseResult | null> {
  const Purchases = loadModule();
  if (!configured || !Purchases) return null;
  try {
    const pkg = monthlyPackage ?? (await Purchases.getOfferings()).current?.monthly ?? null;
    if (!pkg) return 'failed';
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return syncPremiumFromCustomerInfo(customerInfo) ? 'purchased' : 'failed';
  } catch (e) {
    if ((e as { userCancelled?: boolean | null }).userCancelled) return 'cancelled';
    return 'failed';
  }
}

/**
 * 購入を復元する。復元後にエンタイトルメントが有効なら 'restored'、
 * 復元できる購入が無ければ 'none'。未接続なら null(UI側は準備中Alert)
 */
export async function restorePremium(): Promise<RestoreResult | null> {
  const Purchases = loadModule();
  if (!configured || !Purchases) return null;
  try {
    const info = await Purchases.restorePurchases();
    return syncPremiumFromCustomerInfo(info) ? 'restored' : 'none';
  } catch {
    return 'failed';
  }
}

/**
 * プレミアムの次回更新日(エンタイトルメントの expirationDate)を返す。
 * 未接続・未購入・取得失敗のときは null(設定画面は日付なしの表記にフォールバックする)
 */
export async function getPremiumExpirationDate(): Promise<Date | null> {
  const Purchases = loadModule();
  if (!configured || !Purchases) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    const iso = info.entitlements.active[ENTITLEMENT_ID]?.expirationDate;
    return iso ? new Date(iso) : null;
  } catch {
    return null;
  }
}
