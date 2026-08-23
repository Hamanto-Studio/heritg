import { Check, Cloud, Crown, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Translator } from "./i18n";
import type { ProContextValue, SubscriptionPlan } from "./proTypes";
import { ButtonLoader, ErrorNotice, Modal } from "./ui";

const offersFor = (pro: ProContextValue) => "offers" in pro.subscription ? pro.subscription.offers : [];
export function ProPaywallDialog({ pro, t }: { pro: ProContextValue; t: Translator }) {
  const [plan, setPlan] = useState<SubscriptionPlan>("yearly");
  const offers = offersFor(pro);
  const monthly = offers.find((offer) => offer.plan === "monthly");
  const yearly = offers.find((offer) => offer.plan === "yearly");
  const effectivePlan = !yearly && monthly ? "monthly" : plan;
  const selectedOffer = effectivePlan === "yearly" ? yearly : monthly;
  const purchasing = pro.subscription.status === "purchasing";
  const signedIn = pro.account.status === "signedIn";
  const saving = monthly && yearly && monthly.currency === yearly.currency ? Math.max(0, Math.round((1 - yearly.priceMicros / (monthly.priceMicros * 12)) * 100)) : 0;
  return <Modal closeLabel={t("close")} onClose={pro.closePaywall} size="medium" title={t("proPaywallTitle")}>
    <div className="pro-paywall-hero"><span className="pro-mark"><Crown aria-hidden="true" size={25} /></span><div><strong>{t("proPaywallHeadline")}</strong><p>{t("proPaywallIntro")}</p></div></div>
    <ul className="pro-benefits">
      <li><Cloud aria-hidden="true" size={18} /><span><strong>{t("proBenefitSync")}</strong>{t("proBenefitSyncDetail")}</span></li>
      <li><ShieldCheck aria-hidden="true" size={18} /><span><strong>{t("proBenefitBackup")}</strong>{t("proBenefitBackupDetail")}</span></li>
      <li><Check aria-hidden="true" size={18} /><span><strong>{t("proBenefitLocal")}</strong>{t("proBenefitLocalDetail")}</span></li>
    </ul>
    <fieldset className="pro-plan-picker" disabled={purchasing || !pro.configured}><legend>{t("choosePlan")}</legend>
      <label className={effectivePlan === "yearly" ? "selected" : ""}><input checked={effectivePlan === "yearly"} name="pro-plan" onChange={() => setPlan("yearly")} type="radio" /><span className="pro-plan-copy"><span><strong>{t("yearlyPlan")}</strong>{saving > 0 ? <em>{t("savePercent", { count: saving })}</em> : null}</span><small>{yearly?.price ?? t("priceAtLaunch")} {yearly ? t("perYear") : ""}</small></span></label>
      <label className={effectivePlan === "monthly" ? "selected" : ""}><input checked={effectivePlan === "monthly"} name="pro-plan" onChange={() => setPlan("monthly")} type="radio" /><span className="pro-plan-copy"><span><strong>{t("monthlyPlan")}</strong></span><small>{monthly?.price ?? t("priceAtLaunch")} {monthly ? t("perMonth") : ""}</small></span></label>
    </fieldset>
    {!pro.configured ? <div className="pro-availability" role="status"><strong>{t("proComingSoon")}</strong><span>{t("proComingSoonDetail")}</span></div> : null}
    {pro.configured && !signedIn ? <div className="pro-availability" role="status"><strong>{t("signInRequired")}</strong><span>{t("signInBeforePurchase")}</span></div> : null}
    <ErrorNotice message={pro.error} />
    <button aria-busy={purchasing || undefined} className="button primary pro-purchase-button" disabled={!pro.configured || !signedIn || !selectedOffer || purchasing} onClick={() => void pro.purchase(effectivePlan)} type="button">{purchasing ? <ButtonLoader /> : null}{purchasing ? t("openingCheckout") : !pro.configured ? t("subscriptionsComingSoon") : t("subscribeToPro")}</button>
    <p className="pro-legal">{t("subscriptionLegal")}</p>
  </Modal>;
}
