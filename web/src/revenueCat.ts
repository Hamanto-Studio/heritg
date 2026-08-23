import type { Package, Purchases } from "@revenuecat/purchases-js";
import type { ProOffer, SubscriptionPlan } from "./proTypes";

let purchases: Purchases | undefined;
const packages = new Map<SubscriptionPlan, Package>();

const instanceFor = async (appUserId: string) => {
  const { Purchases } = await import("@revenuecat/purchases-js");
  if (!purchases) purchases = Purchases.configure({ apiKey: __REVENUECAT_PUBLIC_API_KEY__, appUserId });
  else if (purchases.getAppUserId() !== appUserId) await purchases.changeUser(appUserId);
  return purchases;
};

export async function loadRevenueCatOffers(appUserId: string): Promise<ProOffer[]> {
  const offerings = await (await instanceFor(appUserId)).getOfferings();
  packages.clear();
  const candidates: [SubscriptionPlan, Package | null][] = [
    ["monthly", offerings.current?.monthly ?? null],
    ["yearly", offerings.current?.annual ?? null]
  ];
  return candidates.flatMap(([plan, item]) => {
    if (!item) return [];
    packages.set(plan, item);
    const price = item.webBillingProduct.price;
    return [{ plan, price: price.formattedPrice, priceMicros: price.amountMicros, currency: price.currency }];
  });
}

export async function purchaseRevenueCatPlan(appUserId: string, plan: SubscriptionPlan, locale: "en" | "id", target?: HTMLElement) {
  const item = packages.get(plan);
  if (!item) throw new Error("The selected subscription is not available.");
  try {
    return await (await instanceFor(appUserId)).purchase({
      rcPackage: item, selectedLocale: locale, htmlTarget: target
    });
  } catch (error) {
    const { ErrorCode, PurchasesError } = await import("@revenuecat/purchases-js");
    if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) return undefined;
    throw error;
  }
}

export async function refreshRevenueCatCustomer(appUserId: string) {
  return (await instanceFor(appUserId)).getCustomerInfo();
}
