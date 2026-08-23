import { Check, Cloud, Crown, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";

import type { Translator } from "./i18n";
import type { FamilyContextValue, SubscriptionPlan } from "./familyTypes";
import { ButtonLoader, ErrorNotice, Modal } from "./ui";

const offersFor = (family: FamilyContextValue) =>
  "offers" in family.subscription ? family.subscription.offers : [];

export function FamilyPaywallDialog({
  family,
  t
}: {
  family: FamilyContextValue;
  t: Translator;
}) {
  const [plan, setPlan] = useState<SubscriptionPlan>("yearly");
  const checkoutRef = useRef<HTMLDivElement>(null);
  const offers = offersFor(family);
  const monthly = offers.find((offer) => offer.plan === "monthly");
  const yearly = offers.find((offer) => offer.plan === "yearly");
  const purchasing = family.subscription.status === "purchasing";
  const signedIn = family.account.status === "signedIn";

  const effectivePlan = !yearly && monthly ? "monthly" : plan;
  const selectedOffer = effectivePlan === "yearly" ? yearly : monthly;
  const yearlySaving = monthly && yearly && monthly.currency === yearly.currency
    ? Math.max(0, Math.round((1 - yearly.priceMicros / (monthly.priceMicros * 12)) * 100))
    : 0;

  return (
    <Modal
      closeLabel={t("close")}
      onClose={family.closePaywall}
      size="medium"
      title={t("familyPaywallTitle")}
    >
      <div className="family-paywall-hero">
        <span className="family-mark"><Crown aria-hidden="true" size={25} /></span>
        <div>
          <strong>{t("familyPaywallHeadline")}</strong>
          <p>{t("familyPaywallIntro")}</p>
        </div>
      </div>

      <ul className="family-benefits">
        <li><Cloud aria-hidden="true" size={18} /><span><strong>{t("familyBenefitSync")}</strong>{t("familyBenefitSyncDetail")}</span></li>
        <li><ShieldCheck aria-hidden="true" size={18} /><span><strong>{t("familyBenefitSharing")}</strong>{t("familyBenefitSharingDetail")}</span></li>
        <li><Check aria-hidden="true" size={18} /><span><strong>{t("familyBenefitLocal")}</strong>{t("familyBenefitLocalDetail")}</span></li>
      </ul>

      <fieldset className="family-plan-picker" disabled={purchasing || !family.configured}>
        <legend>{t("choosePlan")}</legend>
        <label className={effectivePlan === "yearly" ? "selected" : ""}>
          <input checked={effectivePlan === "yearly"} name="family-plan" onChange={() => setPlan("yearly")} type="radio" />
          <span className="family-plan-copy">
            <span><strong>{t("yearlyPlan")}</strong>{yearlySaving > 0 ? <em>{t("savePercent", { count: yearlySaving })}</em> : null}</span>
            <small>{yearly?.price ?? t("priceAtLaunch")} {yearly ? t("perYear") : ""}</small>
          </span>
        </label>
        <label className={effectivePlan === "monthly" ? "selected" : ""}>
          <input checked={effectivePlan === "monthly"} name="family-plan" onChange={() => setPlan("monthly")} type="radio" />
          <span className="family-plan-copy">
            <span><strong>{t("monthlyPlan")}</strong></span>
            <small>{monthly?.price ?? t("priceAtLaunch")} {monthly ? t("perMonth") : ""}</small>
          </span>
        </label>
      </fieldset>

      {!family.configured ? <div className="family-availability" role="status"><strong>{t("familyComingSoon")}</strong><span>{t("familyComingSoonDetail")}</span></div> : null}
      {family.configured && !signedIn ? <div className="family-availability" role="status"><strong>{t("signInRequired")}</strong><span>{t("signInBeforePurchase")}</span></div> : null}
      <ErrorNotice message={family.error} />
      <div className="revenuecat-checkout-target" ref={checkoutRef} />
      <button
        aria-busy={purchasing || undefined}
        className="button primary family-purchase-button"
        disabled={!family.configured || !signedIn || !selectedOffer || purchasing}
        onClick={() => void family.purchase(effectivePlan, checkoutRef.current ?? undefined)}
        type="button"
      >
        {purchasing ? <ButtonLoader /> : null}
        {purchasing ? t("openingCheckout") : !family.configured ? t("subscriptionsComingSoon") : t("subscribeToFamily")}
      </button>
      <p className="family-legal">{t("subscriptionLegal")}</p>
    </Modal>
  );
}
