import { useState } from "react";
import { FamilyPlusBenefits } from "./FamilyPlusBenefits";
import type { Translator } from "./i18n";
import { PaymentMethodLogos } from "./PaymentMethodLogos";
import type { ProContextValue, SubscriptionPlan } from "./proTypes";
import { ButtonLoader, ErrorNotice, Modal } from "./ui";

const offersFor = (pro: ProContextValue) => "offers" in pro.subscription ? pro.subscription.offers : [];
export function ProPaywallDialog({ pro, t }: { pro: ProContextValue; t: Translator }) {
  const [plan, setPlan] = useState<SubscriptionPlan>("five_year");
  const offers = offersFor(pro);
  const twoYear = offers.find((offer) => offer.plan === "two_year");
  const fiveYear = offers.find((offer) => offer.plan === "five_year");
  const effectivePlan = !fiveYear && twoYear ? "two_year" : plan;
  const selectedOffer = effectivePlan === "five_year" ? fiveYear : twoYear;
  const purchasing = pro.subscription.status === "purchasing";
  const signedIn = pro.account.status === "signedIn";
  return <Modal closeLabel={t("close")} onClose={pro.closePaywall} size="medium" title={t("proPaywallTitle")}>
    <FamilyPlusBenefits t={t} />
    <fieldset className="pro-plan-picker" disabled={purchasing || !pro.configured}><legend>{t("choosePlan")}</legend>
      <label className={effectivePlan === "five_year" ? "selected" : ""}><input checked={effectivePlan === "five_year"} name="pro-plan" onChange={() => setPlan("five_year")} type="radio" /><span className="pro-plan-copy"><span><strong>{t("fiveYearPlan")}</strong><em>{t("bestValue")}</em></span><small>{fiveYear?.price ?? t("priceAtLaunch")}<span>{t("oneTimePayment")}</span></small></span></label>
      <label className={effectivePlan === "two_year" ? "selected" : ""}><input checked={effectivePlan === "two_year"} name="pro-plan" onChange={() => setPlan("two_year")} type="radio" /><span className="pro-plan-copy"><span><strong>{t("twoYearPlan")}</strong></span><small>{twoYear?.price ?? t("priceAtLaunch")}<span>{t("oneTimePayment")}</span></small></span></label>
    </fieldset>
    {!pro.configured ? <div className="pro-availability" role="status"><strong>{t("proComingSoon")}</strong><span>{t("proComingSoonDetail")}</span></div> : null}
    {pro.configured && !signedIn ? <div className="pro-availability" role="status"><strong>{t("signInRequired")}</strong><span>{t("signInBeforePurchase")}</span></div> : null}
    <div aria-label={t("indonesianPaymentMethods")}><PaymentMethodLogos cardLabel={t("bankCard")} /></div>
    <p className="payment-provider-note">{t("secureCheckoutDetail")}</p>
    <ErrorNotice message={pro.error} />
    <button aria-busy={purchasing || undefined} className="button primary pro-purchase-button" disabled={!pro.configured || !signedIn || !selectedOffer || purchasing} onClick={() => void pro.purchase(effectivePlan)} type="button">{purchasing ? <ButtonLoader /> : null}{purchasing ? t("openingCheckout") : !pro.configured ? t("subscriptionsComingSoon") : t("subscribeToPro")}</button>
    <p className="pro-legal">{t("subscriptionLegal")}</p>
  </Modal>;
}
